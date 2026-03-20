const {
    getParticipantByUserId,
    getParticipantCompetitions,
    getRankings,
} = require("../services/participantService");
const { HttpError } = require("../utils/httpError");

async function me(req, res) {
    const participant = await getParticipantByUserId(req.user.id);

    if (!participant) {
        throw new HttpError(404, "Participant profile not found");
    }

    res.json(participant);
}

async function myCompetitions(req, res) {
    if (!req.participant) {
        throw new HttpError(404, "Participant profile not found");
    }

    const competitions = await getParticipantCompetitions(req.participant.id);
    res.json(competitions);
}

async function rankings(req, res) {
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);

    const data = await getRankings(limit, offset);
    res.json({
        type: "participation-ranking",
        items: data,
    });
}

module.exports = { me, myCompetitions, rankings };
