const { prisma, Prisma } = require("../db/prisma");

async function getParticipantByUserId(userId) {
    const data = await prisma.$queryRaw`
        SELECT id, "userId", cnic, email, "fullName", phone, institution, "rollNumber", "createdAt", "updatedAt"
        FROM "Participant"
        WHERE "userId" = ${userId}
        LIMIT 1
    `;

    return data[0] || null;
}

async function getParticipantCompetitions(participantId) {
    const memberships = await prisma.$queryRaw`
        SELECT "teamId", "isLeader", "joinedAt"
        FROM "TeamMember"
        WHERE "participantId" = ${participantId}
    `;

    if (!memberships.length) {
        return [];
    }

    const teamIds = [...new Set(memberships.map((item) => item.teamId))];

    const teams = await prisma.$queryRaw`
        SELECT id, "competitionId", name, "paymentStatus"
        FROM "Team"
        WHERE id IN (${Prisma.join(teamIds)})
    `;

    const competitionIds = [...new Set(teams.map((item) => item.competitionId))];
    const competitions = competitionIds.length
        ? await prisma.$queryRaw`
            SELECT id, name, "compDay", "startTime", "endTime"
            FROM "Competition"
            WHERE id IN (${Prisma.join(competitionIds)})
        `
        : [];

    const competitionVenues = competitionIds.length
        ? await prisma.$queryRaw`
            SELECT "A", "B"
            FROM "_CompetitionToVenue"
            WHERE "A" IN (${Prisma.join(competitionIds)})
        `
        : [];

    const venueIds = [...new Set(competitionVenues.map((item) => item.B))];
    const venues = venueIds.length
        ? await prisma.$queryRaw`
            SELECT id, name
            FROM "Venue"
            WHERE id IN (${Prisma.join(venueIds)})
        `
        : [];

    const teamById = new Map(teams.map((item) => [item.id, item]));
    const competitionById = new Map(competitions.map((item) => [item.id, item]));
    const venueById = new Map(venues.map((item) => [item.id, item]));
    const venueByCompetitionId = new Map();

    for (const link of competitionVenues) {
        if (!venueByCompetitionId.has(link.A)) {
            venueByCompetitionId.set(link.A, []);
        }
        venueByCompetitionId.get(link.A).push(venueById.get(link.B));
    }

    return memberships
        .map((membership) => {
            const team = teamById.get(membership.teamId);
            if (!team) {
                return null;
            }

            const competition = competitionById.get(team.competitionId);
            if (!competition) {
                return null;
            }

            const firstVenue = (venueByCompetitionId.get(team.competitionId) || []).find(
                Boolean
            );

            return {
                teamId: membership.teamId,
                isLeader: membership.isLeader,
                joinedAt: membership.joinedAt,
                competitionId: team.competitionId,
                teamName: team.name,
                paymentStatus: team.paymentStatus,
                competitionName: competition.name,
                compDay: competition.compDay,
                startTime: competition.startTime,
                endTime: competition.endTime,
                venueId: firstVenue ? firstVenue.id : null,
                venueName: firstVenue ? firstVenue.name : null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const dayCompare = String(a.compDay).localeCompare(String(b.compDay));
            if (dayCompare !== 0) {
                return dayCompare;
            }
            return String(a.competitionName).localeCompare(String(b.competitionName));
        });
}

async function getRankings(limit, offset) {
    const participants = await prisma.$queryRaw`
        SELECT id, "fullName", institution
        FROM "Participant"
    `;

    const memberships = await prisma.$queryRaw`
        SELECT "participantId", "teamId"
        FROM "TeamMember"
    `;

    const teamIds = [...new Set(memberships.map((item) => item.teamId))];
    const teams = teamIds.length
        ? await prisma.$queryRaw`
            SELECT id, "competitionId"
            FROM "Team"
            WHERE id IN (${Prisma.join(teamIds)})
        `
        : [];

    const competitionByTeamId = new Map(teams.map((item) => [item.id, item.competitionId]));
    const membershipByParticipant = new Map();

    for (const membership of memberships) {
        if (!membershipByParticipant.has(membership.participantId)) {
            membershipByParticipant.set(membership.participantId, []);
        }
        membershipByParticipant.get(membership.participantId).push(membership.teamId);
    }

    const ranked = participants
        .map((participant) => {
            const participantTeams = membershipByParticipant.get(participant.id) || [];
            const competitionSet = new Set();
            for (const teamId of participantTeams) {
                const competitionId = competitionByTeamId.get(teamId);
                if (competitionId) {
                    competitionSet.add(competitionId);
                }
            }

            return {
                participantId: participant.id,
                fullName: participant.fullName,
                institution: participant.institution,
                teamMemberships: participantTeams.length,
                competitionsJoined: competitionSet.size,
            };
        })
        .sort((a, b) => {
            if (b.competitionsJoined !== a.competitionsJoined) {
                return b.competitionsJoined - a.competitionsJoined;
            }
            if (b.teamMemberships !== a.teamMemberships) {
                return b.teamMemberships - a.teamMemberships;
            }
            return String(a.fullName).localeCompare(String(b.fullName));
        });

    return ranked.slice(offset, offset + limit);
}

module.exports = {
    getParticipantByUserId,
    getParticipantCompetitions,
    getRankings,
};
