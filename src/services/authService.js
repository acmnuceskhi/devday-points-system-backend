const bcrypt = require("bcryptjs");
const { env } = require("../config/env");
const { HttpError } = require("../utils/httpError");
const { signAccessToken } = require("../utils/jwt");
const {
    findUserByEmail,
    findParticipantByUserId,
    logUserAction,
} = require("./userService");

function isBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$/.test(value);
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

module.exports = { loginParticipant };
