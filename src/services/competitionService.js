const { supabase } = require("../db/supabase");

function throwDbError(context, error) {
    throw new Error(`${context}: ${error.message}`);
}

async function listCompetitions({ activeOnly, limit, offset }) {
    let query = supabase
        .from("Competition")
        .select(
            "id, name, description, fee, minTeamSize, maxTeamSize, capacityLimit, compDay, startTime, endTime, isActive, registrationDeadline, earlyBirdFee, earlyBirdLimit, totalSeats"
        )
        .order("compDay", { ascending: true })
        .order("name", { ascending: true })
        .range(offset, offset + limit - 1);

    if (activeOnly) {
        query = query.eq("isActive", true);
    }

    const { data: competitions, error: competitionsError } = await query;

    if (competitionsError) {
        throwDbError("Failed to list competitions", competitionsError);
    }

    if (!competitions.length) {
        return [];
    }

    const competitionIds = competitions.map((item) => item.id);
    const { data: teams, error: teamsError } = await supabase
        .from("Team")
        .select("id, competitionId")
        .in("competitionId", competitionIds);

    if (teamsError) {
        throwDbError("Failed to fetch competition team counts", teamsError);
    }

    const teamCountByCompetition = new Map();
    for (const team of teams) {
        teamCountByCompetition.set(
            team.competitionId,
            (teamCountByCompetition.get(team.competitionId) || 0) + 1
        );
    }

    return competitions.map((competition) => ({
        ...competition,
        availableSeats: Math.max(
            Number(competition.capacityLimit || 0) -
            Number(teamCountByCompetition.get(competition.id) || 0),
            0
        ),
    }));
}

async function getCompetitionById(competitionId) {
    const { data: rows, error } = await supabase
        .from("Competition")
        .select(
            "id, name, description, fee, minTeamSize, maxTeamSize, capacityLimit, compDay, startTime, endTime, isActive, registrationDeadline, earlyBirdFee, earlyBirdLimit, totalSeats"
        )
        .eq("id", competitionId)
        .limit(1);

    if (error) {
        throwDbError("Failed to fetch competition details", error);
    }

    const competition = rows[0] || null;
    if (!competition) {
        return null;
    }

    const { data: teams, error: teamsError } = await supabase
        .from("Team")
        .select("id")
        .eq("competitionId", competitionId);

    if (teamsError) {
        throwDbError("Failed to fetch competition team counts", teamsError);
    }

    return {
        ...competition,
        availableSeats: Math.max(
            Number(competition.capacityLimit || 0) - Number(teams.length),
            0
        ),
    };
}

async function getCompetitionVenues(competitionId) {
    const { data: links, error: linksError } = await supabase
        .from("_CompetitionToVenue")
        .select("A, B")
        .eq("A", competitionId);

    if (linksError) {
        throwDbError("Failed to fetch competition venue links", linksError);
    }

    if (!links.length) {
        return [];
    }

    const venueIds = [...new Set(links.map((item) => item.B))];
    const { data: venues, error: venuesError } = await supabase
        .from("Venue")
        .select("id, name, location, capacity, facilities")
        .in("id", venueIds)
        .order("name", { ascending: true });

    if (venuesError) {
        throwDbError("Failed to fetch competition venues", venuesError);
    }

    return venues;
}

module.exports = {
    listCompetitions,
    getCompetitionById,
    getCompetitionVenues,
};
