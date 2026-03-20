const { getTeamIfMember, getTeamDetail } = require("../services/teamService");
const { HttpError } = require("../utils/httpError");

async function detail(req, res) {
    if (!req.participant) {
        throw new HttpError(404, "Participant profile not found");
    }

    const membership = await getTeamIfMember(req.params.id, req.participant.id);

    if (!membership) {
        throw new HttpError(403, "You are not allowed to view this team");
    }

    const team = await getTeamDetail(req.params.id);

    if (!team) {
        throw new HttpError(404, "Team not found");
    }

    res.json(team);
}

module.exports = { detail };
