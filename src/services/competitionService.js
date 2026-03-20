const { prisma, Prisma } = require("../db/prisma");

async function listCompetitions({ activeOnly, limit, offset }) {
    const activeFilter = activeOnly
        ? Prisma.sql`WHERE "isActive" = true`
        : Prisma.empty;

    const competitions = await prisma.$queryRaw`
        SELECT id, name, description, fee, "minTeamSize", "maxTeamSize", "capacityLimit", "compDay", "startTime", "endTime", "isActive", "registrationDeadline", "earlyBirdFee", "earlyBirdLimit", "totalSeats"
        FROM "Competition"
        ${activeFilter}
        ORDER BY "compDay" ASC, name ASC
        LIMIT ${limit} OFFSET ${offset}
    `;

    if (!competitions.length) {
        return [];
    }

    const competitionIds = competitions.map((item) => item.id);
    const teams = await prisma.$queryRaw`
        SELECT id, "competitionId"
        FROM "Team"
        WHERE "competitionId" IN (${Prisma.join(competitionIds)})
    `;

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
    const rows = await prisma.$queryRaw`
        SELECT id, name, description, fee, "minTeamSize", "maxTeamSize", "capacityLimit", "compDay", "startTime", "endTime", "isActive", "registrationDeadline", "earlyBirdFee", "earlyBirdLimit", "totalSeats"
        FROM "Competition"
        WHERE id = ${competitionId}
        LIMIT 1
    `;

    const competition = rows[0] || null;
    if (!competition) {
        return null;
    }

    const teams = await prisma.$queryRaw`
        SELECT id
        FROM "Team"
        WHERE "competitionId" = ${competitionId}
    `;

    return {
        ...competition,
        availableSeats: Math.max(
            Number(competition.capacityLimit || 0) - Number(teams.length),
            0
        ),
    };
}

async function getCompetitionVenues(competitionId) {
    const links = await prisma.$queryRaw`
        SELECT "A", "B"
        FROM "_CompetitionToVenue"
        WHERE "A" = ${competitionId}
    `;

    if (!links.length) {
        return [];
    }

    const venueIds = [...new Set(links.map((item) => item.B))];
    const venues = await prisma.$queryRaw`
        SELECT id, name, location, capacity, facilities
        FROM "Venue"
        WHERE id IN (${Prisma.join(venueIds)})
        ORDER BY name ASC
    `;

    return venues;
}

module.exports = {
    listCompetitions,
    getCompetitionById,
    getCompetitionVenues,
};
