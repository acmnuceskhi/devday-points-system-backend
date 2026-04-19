const bcrypt = require("bcryptjs");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { prisma } = require("../db/prisma");
const { env } = require("../config/env");
const { HttpError } = require("../utils/httpError");
const { signAccessToken } = require("../utils/jwt");
const { sendSignupOtpEmail } = require("./mailerService");
const {
    findUserByEmail,
    findUserByEmailInsensitive,
    findParticipantByUserId,
    findParticipantAccountByEmail,
    findStaffProfileByUserId,
    logUserAction,
} = require("./userService");

const OTP_TTL_MINUTES = 15;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MINIGAME_CODE_LENGTH = 6;
const MINIGAME_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MINIGAME_CODE_MAX_ATTEMPTS = 12;
const PARTICIPANT_ALREADY_REGISTERED_CODE = "PARTICIPANT_ALREADY_REGISTERED";
const EXISTING_PARTICIPANT_SIGNUP_MESSAGE =
    "You already have a registered account, likely because you registered for a competition. Your password has already been emailed to you. Use that to log in.";

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
    const base = env.SIGNUP_VERIFY_BASE_URL || `${env.FRONTEND_ORIGIN}/signup/verify`;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function generateMinigameCode() {
    let code = "";
    const random = randomBytes(MINIGAME_CODE_LENGTH);

    for (let i = 0; i < MINIGAME_CODE_LENGTH; i += 1) {
        const index = random[i] % MINIGAME_CODE_ALPHABET.length;
        code += MINIGAME_CODE_ALPHABET[index];
    }

    return code;
}

function isUniqueViolation(error) {
    if (!error) return false;

    if (error.code === "23505") {
        return true;
    }

    const message = String(error.message || "").toLowerCase();
    return message.includes("duplicate") || message.includes("unique");
}

async function assignMinigameCodeIfMissing(tx, participantId) {
    for (let attempt = 1; attempt <= MINIGAME_CODE_MAX_ATTEMPTS; attempt += 1) {
        const candidateCode = generateMinigameCode();

        try {
            const updatedParticipant = (await tx.$queryRaw`
                UPDATE "Participant"
                SET
                    "minigameCode" = ${candidateCode},
                    "updatedAt" = NOW()
                WHERE id = ${participantId}
                  AND "minigameCode" IS NULL
                RETURNING "minigameCode"
            `)[0];

            if (updatedParticipant?.minigameCode) {
                return updatedParticipant.minigameCode;
            }

            const existingParticipant = (await tx.$queryRaw`
                SELECT "minigameCode"
                FROM "Participant"
                WHERE id = ${participantId}
                LIMIT 1
            `)[0];

            if (existingParticipant?.minigameCode) {
                return String(existingParticipant.minigameCode).toUpperCase();
            }
        } catch (error) {
            if (isUniqueViolation(error)) {
                continue;
            }
            throw error;
        }
    }

    throw new HttpError(500, "Could not assign minigame code. Please try again.");
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

    let participant = await findParticipantByUserId(user.id);

    if (!participant) {
        throw new HttpError(403, "No participant profile found");
    }

    if (!participant.minigameCode) {
        await prisma.$transaction(async (tx) => {
            await assignMinigameCodeIfMissing(tx, participant.id);
        });

        participant = await findParticipantByUserId(user.id);
        if (!participant) {
            throw new HttpError(403, "No participant profile found");
        }
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

async function requestParticipantSignup(email, fullName, requestedIp) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedFullName = String(fullName || "").trim();
    console.log(`[signup][request] email=${normalizedEmail} ip=${requestedIp || "unknown"}`);

    if (!normalizedFullName) {
        throw new HttpError(400, "Full name is required");
    }

    const participantAccount = await findParticipantAccountByEmail(normalizedEmail);
    const existingUser = await findUserByEmailInsensitive(normalizedEmail);

    if (existingUser && existingUser.type !== "PARTICIPANT") {
        throw new HttpError(409, "This email is already associated with a non-participant account");
    }

    if (
        (participantAccount && participantAccount.userId && participantAccount.password) ||
        (!participantAccount && existingUser && existingUser.password)
    ) {
        console.log(`[signup][request] blocked-existing-account email=${normalizedEmail}`);
        throw new HttpError(409, EXISTING_PARTICIPANT_SIGNUP_MESSAGE, {
            code: PARTICIPANT_ALREADY_REGISTERED_CODE,
            details: {
                loginPath: "/login",
            },
        });
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
            console.log(`[signup][request] cooldown-hit email=${normalizedEmail} wait=${OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds}s`);
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
                (id, email, "fullName", "tokenHash", "expiresAt", "requestedIp", "createdAt", "updatedAt")
            VALUES
                (${randomUUID()}, ${normalizedEmail}, ${normalizedFullName}, ${tokenHash}, ${expiresAt}, ${requestedIp || null}, NOW(), NOW())
        `;
    });

    const signupLink = buildSignupLink(normalizedEmail, token);
    const emailResult = await sendSignupOtpEmail({
        toEmail: normalizedEmail,
        fullName: normalizedFullName,
        signupLink,
        expiresInMinutes: OTP_TTL_MINUTES,
    });

    if (!emailResult.delivered) {
        console.error(
            `[signup][request] email-delivery-failed email=${normalizedEmail} reason=${emailResult.reason || "UNKNOWN"}`
        );
        throw new HttpError(500, "Signup email service is not configured. Please contact support.", {
            code: "SIGNUP_EMAIL_NOT_CONFIGURED",
        });
    }

    if (env.NODE_ENV !== "production") {
        console.log(`[signup][request] verify-link=${signupLink}`);
    }

    return {
        message: `Verification email sent to ${normalizedEmail} if such an email exists.`,
        hint: "If you already registered for a competition, use that same email so your scores stay in one place.",
        signupLink: env.NODE_ENV === "production" ? undefined : signupLink,
        expiresInMinutes: OTP_TTL_MINUTES,
    };
}

async function verifyParticipantSignup(email, token, password) {
    const normalizedEmail = normalizeEmail(email);
    const tokenHash = hashOtpToken(token);
    console.log(`[signup][verify] email=${normalizedEmail} tokenPrefix=${String(token).slice(0, 8)}`);

    const otp = (await prisma.$queryRaw`
                SELECT id, email, "fullName", "expiresAt", "consumedAt"
        FROM "SignupOtpLink"
        WHERE lower(email) = lower(${normalizedEmail})
          AND "tokenHash" = ${tokenHash}
        LIMIT 1
    `)[0];

    if (!otp || otp.consumedAt) {
        console.log(`[signup][verify] invalid-or-used-token email=${normalizedEmail}`);
        throw new HttpError(400, "Invalid or already used signup token");
    }

    if (new Date(otp.expiresAt).getTime() < Date.now()) {
        console.log(`[signup][verify] expired-token email=${normalizedEmail}`);
        throw new HttpError(400, "Signup token expired");
    }

    const participantAccount = await findParticipantAccountByEmail(normalizedEmail);
    const existingUser = await findUserByEmailInsensitive(normalizedEmail);

    if (
        (participantAccount && participantAccount.password) ||
        (!participantAccount && existingUser && existingUser.password)
    ) {
        console.log(`[signup][verify] already-has-password email=${normalizedEmail}`);
        throw new HttpError(409, EXISTING_PARTICIPANT_SIGNUP_MESSAGE, {
            code: PARTICIPANT_ALREADY_REGISTERED_CODE,
            details: {
                loginPath: "/login",
            },
        });
    }

    if (existingUser && existingUser.type !== "PARTICIPANT") {
        throw new HttpError(409, "This email is already associated with a non-participant account");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let resolvedUserId = participantAccount?.userId || existingUser?.id || null;

    await prisma.$transaction(async (tx) => {
        let participantId = null;

        await tx.$queryRaw`
            UPDATE "SignupOtpLink"
            SET
                "consumedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE id = ${otp.id}
        `;

        if (!resolvedUserId) {
            const createdUser = (await tx.$queryRaw`
                INSERT INTO "User"
                    (id, email, password, "isActive", type, "createdAt", "updatedAt")
                VALUES
                    (${randomUUID()}, ${normalizedEmail}, ${passwordHash}, true, ${"PARTICIPANT"}::"UserType", NOW(), NOW())
                RETURNING id
            `)[0];

            resolvedUserId = createdUser.id;
        } else {
            await tx.$queryRaw`
                UPDATE "User"
                SET
                    password = ${passwordHash},
                    "isActive" = true,
                    "updatedAt" = NOW()
                WHERE id = ${resolvedUserId}
            `;
        }

        const participantByEmail = (await tx.$queryRaw`
            SELECT id, "userId"
            FROM "Participant"
            WHERE lower(email) = lower(${normalizedEmail})
            LIMIT 1
        `)[0];

        if (participantByEmail) {
            participantId = participantByEmail.id;
            if (participantByEmail.userId !== resolvedUserId) {
                await tx.$queryRaw`
                    UPDATE "Participant"
                    SET
                        "userId" = ${resolvedUserId},
                        "fullName" = ${String(otp.fullName || "").trim() || "Participant"},
                        "updatedAt" = NOW()
                    WHERE id = ${participantByEmail.id}
                `;
            }
        } else {
            const createdParticipant = (await tx.$queryRaw`
                INSERT INTO "Participant"
                    (id, "userId", cnic, email, "fullName", "createdAt", "updatedAt")
                VALUES
                    (
                        ${randomUUID()},
                        ${resolvedUserId},
                        NULL,
                        ${normalizedEmail},
                        ${String(otp.fullName || "").trim() || "Participant"},
                        NOW(),
                        NOW()
                    )
                RETURNING id
            `)[0];
            participantId = createdParticipant?.id || null;
        }

        if (participantId) {
            await assignMinigameCodeIfMissing(tx, participantId);
        }
    });

    const participant = await findParticipantByUserId(resolvedUserId);
    if (!participant) {
        throw new HttpError(404, "No participant profile found");
    }

    await logUserAction(resolvedUserId, "LOGIN");
    console.log(`[signup][verify] success email=${normalizedEmail} userId=${resolvedUserId}`);

    const accessToken = signAccessToken({
        userId: resolvedUserId,
        email: normalizedEmail,
        type: "PARTICIPANT",
        participantId: participant.id,
    });

    return {
        message: "Signup completed successfully.",
        accessToken,
        user: {
            id: resolvedUserId,
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
