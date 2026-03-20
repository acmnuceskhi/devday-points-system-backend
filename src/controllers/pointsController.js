const {
    getMyPointsSummary,
    getMyActivityProgress,
    getLeaderboard,
} = require("../services/pointsService");
const { HttpError } = require("../utils/httpError");

async function mySummary(req, res) {
    if (!req.participant) {
        throw new HttpError(404, "Participant profile not found");
    }

    const summary = await getMyPointsSummary(req.participant.id);
    res.json(summary);
}

async function myActivities(req, res) {
    if (!req.participant) {
        throw new HttpError(404, "Participant profile not found");
    }

    const items = await getMyActivityProgress(req.participant.id);
    res.json(items);
}

async function leaderboard(req, res) {
    const parsedLimit = Number(req.query.limit);
    const parsedOffset = Number(req.query.offset);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 20;
    const offset = Number.isFinite(parsedOffset) ? parsedOffset : 0;
    const items = await getLeaderboard(limit, offset);

    res.json({
        type: "points-leaderboard",
        items,
    });
}

module.exports = {
    mySummary,
    myActivities,
    leaderboard,
};
