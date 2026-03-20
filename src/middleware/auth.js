const { verifyAccessToken } = require("../utils/jwt");
const { HttpError } = require("../utils/httpError");
const {
    findParticipantByUserId,
    findStaffProfileByUserId,
    findUserById,
} = require("../services/userService");

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
        const staffProfile = user.type === "STAFF"
            ? await findStaffProfileByUserId(user.id)
            : null;

        req.auth = payload;
        req.user = user;
        req.participant = participant || null;
        req.staffProfile = staffProfile || null;
        return next();
    } catch (err) {
        return next(new HttpError(401, "Invalid or expired token"));
    }
}

function requireSuperAdmin(req, res, next) {
    if (!req.user) {
        return next(new HttpError(401, "Unauthorized"));
    }

    if (req.user.type !== "STAFF") {
        return next(new HttpError(403, "Staff access required"));
    }

    if (!req.staffProfile || !req.staffProfile.isApproved) {
        return next(new HttpError(403, "Approved staff profile required"));
    }

    if (req.staffProfile.staffRole !== "SUPERADMIN") {
        return next(new HttpError(403, "Superadmin access required"));
    }

    return next();
}

module.exports = { requireAuth, requireSuperAdmin };
