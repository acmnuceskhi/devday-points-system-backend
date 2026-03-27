const bcrypt = require("bcryptjs");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { prisma } = require("../db/prisma");
const { env } = require("../config/env");
const { HttpError } = require("../utils/httpError");
const { signAccessToken } = require("../utils/jwt");
const {
    findUserByEmail,
    findParticipantByUserId,
    findParticipantAccountByEmail,
    findStaffProfileByUserId,
    logUserAction,
} = require("./userService");

const OTP_TTL_MINUTES = 15;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const EXISTING_PARTICIPANT_SIGNUP_MESSAGE =
    "You already have a registered account, likely because you registered for a competition. Your password has already been emailed to you. Please login.";

function isBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$/.test(value);
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function hashOtpToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function buildSignupLink(email, token) {
    const base = env.SIGNUP_VERIFY_BASE_URL || `${env.FRONTEND_ORIGIN}/login`;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

async function loginParticipant(email, inputPassword) {
    const user = await findUserByEmail(email);

    if (!user) {
        console.log(`Login attempt with non-existent email: ${email}`);
        throw new HttpError(401, "Invalid credentials");
    }

    if (!user.isActive) {
        throw new HttpError(403, "User is inactive");
    }

    const passwordInDb = user.password || "";
    const normalizedInput = inputPassword || "";

    if (passwordInDb === "") {
        if (!env.ALLOW_EMPTY_PASSWORD_LOGIN) {
            throw new HttpError(403, "Empty-password login is disabled");
        }

        if (normalizedInput !== "") {
            throw new HttpError(401, "Invalid credentials");
        }
    } else if (isBcryptHash(passwordInDb)) {
        const matches = await bcrypt.compare(normalizedInput, passwordInDb);
        if (!matches) {
            throw new HttpError(401, "Invalid credentials");
        }
    } else if (passwordInDb !== normalizedInput) {
        throw new HttpError(401, "Invalid credentials");
    }

    const participant = await findParticipantByUserId(user.id);

    if (!participant) {
        throw new HttpError(403, "No participant profile found");
    }

    await logUserAction(user.id, "LOGIN");

    const accessToken = signAccessToken({
        userId: user.id,
        email: user.email,
        type: user.type,
        participantId: participant.id,
    });

    return {
        accessToken,
        user: {
            id: user.id,
            email: user.email,
            type: user.type,
        },
        participant,
    };
}

async function loginAdmin(email, inputPassword) {
    const user = await findUserByEmail(email);

    if (!user) {
        throw new HttpError(401, "Invalid credentials");
    }

    if (!user.isActive) {
        throw new HttpError(403, "User is inactive");
    }

    if (user.type !== "STAFF") {
        throw new HttpError(403, "Staff access required");
    }

    const passwordInDb = user.password || "";
    const normalizedInput = inputPassword || "";

    if (passwordInDb === "") {
        if (!env.ALLOW_EMPTY_PASSWORD_LOGIN) {
            throw new HttpError(403, "Empty-password login is disabled");
        }

        if (normalizedInput !== "") {
            throw new HttpError(401, "Invalid credentials");
        }
    } else if (isBcryptHash(passwordInDb)) {
        const matches = await bcrypt.compare(normalizedInput, passwordInDb);
        if (!matches) {
            throw new HttpError(401, "Invalid credentials");
        }
    } else if (passwordInDb !== normalizedInput) {
        throw new HttpError(401, "Invalid credentials");
    }

    const staffProfile = await findStaffProfileByUserId(user.id);

    if (!staffProfile) {
        throw new HttpError(403, "No staff profile found");
    }

    if (!staffProfile.isApproved) {
        throw new HttpError(403, "Staff profile is not approved");
    }

    if (staffProfile.staffRole !== "SUPERADMIN") {
        throw new HttpError(403, "Superadmin access required");
    }

    await logUserAction(user.id, "LOGIN");

    const accessToken = signAccessToken({
        userId: user.id,
        email: user.email,
        type: user.type,
        staffProfileId: staffProfile.id,
        staffRole: staffProfile.staffRole,
    });

    return {
        accessToken,
        user: {
            id: user.id,
            email: user.email,
            type: user.type,
        },
        staffProfile,
    };
}

async function requestParticipantSignup(email, requestedIp) {
    const normalizedEmail = normalizeEmail(email);
    const participantAccount = await findParticipantAccountByEmail(normalizedEmail);

    if (participantAccount && participantAccount.userId && participantAccount.password) {
        throw new HttpError(409, EXISTING_PARTICIPANT_SIGNUP_MESSAGE);
    }

    if (!participantAccount || !participantAccount.userId) {
        // Keep unknown and ineligible paths non-specific.
        return {
            message: "If this email is eligible for signup, a verification link has been created.",
        };
    }

    const latestToken = (await prisma.$queryRaw`
        SELECT "createdAt"
        FROM "SignupOtpLink"
        WHERE lower(email) = lower(${normalizedEmail})
        ORDER BY "createdAt" DESC
        LIMIT 1
    `)[0];

    if (latestToken) {
        const createdAtMs = new Date(latestToken.createdAt).getTime();
        const elapsedSeconds = Math.floor((Date.now() - createdAtMs) / 1000);
        if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
            throw new HttpError(
                429,
                `Please wait ${OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds}s before requesting another signup link`
            );
        }
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashOtpToken(token);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
            UPDATE "SignupOtpLink"
            SET
                "consumedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE lower(email) = lower(${normalizedEmail})
              AND "consumedAt" IS NULL
        `;

        await tx.$queryRaw`
            INSERT INTO "SignupOtpLink"
                (id, email, "tokenHash", "expiresAt", "requestedIp")
            VALUES
                (${randomUUID()}, ${normalizedEmail}, ${tokenHash}, ${expiresAt}, ${requestedIp || null})
        `;
    });

    const signupLink = buildSignupLink(normalizedEmail, token);

    return {
        message: "Signup verification link created.",
        signupLink,
        expiresInMinutes: OTP_TTL_MINUTES,
    };
}

async function verifyParticipantSignup(email, token, password) {
    const normalizedEmail = normalizeEmail(email);
    const tokenHash = hashOtpToken(token);

    const otp = (await prisma.$queryRaw`
        SELECT id, email, "expiresAt", "consumedAt"
        FROM "SignupOtpLink"
        WHERE lower(email) = lower(${normalizedEmail})
          AND "tokenHash" = ${tokenHash}
        LIMIT 1
    `)[0];

    if (!otp || otp.consumedAt) {
        throw new HttpError(400, "Invalid or already used signup token");
    }

    if (new Date(otp.expiresAt).getTime() < Date.now()) {
        throw new HttpError(400, "Signup token expired");
    }

    const participantAccount = await findParticipantAccountByEmail(normalizedEmail);

    if (!participantAccount || !participantAccount.userId) {
        throw new HttpError(403, "This email is not eligible for participant signup");
    }

    if (participantAccount.password) {
        throw new HttpError(409, EXISTING_PARTICIPANT_SIGNUP_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
            UPDATE "SignupOtpLink"
            SET
                "consumedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE id = ${otp.id}
        `;

        const rows = await tx.$queryRaw`
            UPDATE "User"
            SET
                password = ${passwordHash},
                "isActive" = true,
                "updatedAt" = NOW()
            WHERE id = ${participantAccount.userId}
            RETURNING id
        `;
        const updated = rows[0] || null;
        if (!updated) {
            throw new HttpError(404, "Participant account not found");
        }
    });

    const participant = await findParticipantByUserId(participantAccount.userId);
    if (!participant) {
        throw new HttpError(404, "No participant profile found");
    }

    await logUserAction(participantAccount.userId, "LOGIN");

    const accessToken = signAccessToken({
        userId: participantAccount.userId,
        email: normalizedEmail,
        type: "PARTICIPANT",
        participantId: participant.id,
    });

    return {
        message: "Signup completed successfully.",
        accessToken,
        user: {
            id: participantAccount.userId,
            email: normalizedEmail,
            type: "PARTICIPANT",
        },
        participant,
    };
}

module.exports = {
    loginParticipant,
    loginAdmin,
    requestParticipantSignup,
    verifyParticipantSignup,
};
