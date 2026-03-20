const {
    listCompetitions,
    getCompetitionById,
    getCompetitionVenues,
} = require("../services/competitionService");
const { HttpError } = require("../utils/httpError");

async function list(req, res) {
    const activeOnly = (req.query.active || "true") !== "false";
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);

    const competitions = await listCompetitions({ activeOnly, limit, offset });
    res.json(competitions);
}

async function detail(req, res) {
    const competition = await getCompetitionById(req.params.id);

    if (!competition) {
        throw new HttpError(404, "Competition not found");
    }

    const venues = await getCompetitionVenues(req.params.id);
    res.json({ ...competition, venues });
}

async function venues(req, res) {
    const venuesList = await getCompetitionVenues(req.params.id);
    res.json(venuesList);
}

module.exports = { list, detail, venues };
