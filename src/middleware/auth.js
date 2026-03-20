const { verifyAccessToken } = require("../utils/jwt");
const { HttpError } = require("../utils/httpError");
const { findParticipantByUserId, findUserById } = require("../services/userService");

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";

    if (!token) {
        return next(new HttpError(401, "Missing bearer token"));
    }

    try {
        const payload = verifyAccessToken(token);
        const user = await findUserById(payload.userId);

        if (!user || !user.isActive) {
            return next(new HttpError(401, "Unauthorized"));
        }

        const participant = await findParticipantByUserId(user.id);

        req.auth = payload;
        req.user = user;
        req.participant = participant || null;
        return next();
    } catch (err) {
        return next(new HttpError(401, "Invalid or expired token"));
    }
}

module.exports = { requireAuth };
