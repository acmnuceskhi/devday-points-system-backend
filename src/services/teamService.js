const { prisma, Prisma } = require("../db/prisma");

async function getTeamIfMember(teamId, participantId) {
    const rows = await prisma.$queryRaw`
        SELECT "teamId"
        FROM "TeamMember"
        WHERE "teamId" = ${teamId} AND "participantId" = ${participantId}
        LIMIT 1
    `;

    return rows[0] || null;
}

async function getTeamDetail(teamId) {
    const teamRows = await prisma.$queryRaw`
        SELECT id, name, "competitionId", "referenceId", "paymentStatus", "paymentProofUrl", "paymentMethod", "paymentDate", "declaredTID", "amountPaid", "isEarlyBird"
        FROM "Team"
        WHERE id = ${teamId}
        LIMIT 1
    `;

    const team = teamRows[0] || null;

    if (!team) {
        return null;
    }

    const competitions = await prisma.$queryRaw`
        SELECT id, name
        FROM "Competition"
        WHERE id = ${team.competitionId}
        LIMIT 1
    `;

    const competition = competitions[0] || null;

    const memberships = await prisma.$queryRaw`
        SELECT id, "participantId", "isLeader", "joinedAt"
        FROM "TeamMember"
        WHERE "teamId" = ${teamId}
    `;

    const participantIds = [...new Set(memberships.map((item) => item.participantId))];
    const participants = participantIds.length
        ? await prisma.$queryRaw`
            SELECT id, "fullName", institution, email
            FROM "Participant"
            WHERE id IN (${Prisma.join(participantIds)})
        `
        : [];

    const participantById = new Map(participants.map((item) => [item.id, item]));
    const members = memberships
        .map((membership) => {
            const participant = participantById.get(membership.participantId);
            return {
                id: membership.id,
                participantId: membership.participantId,
                isLeader: membership.isLeader,
                joinedAt: membership.joinedAt,
                fullName: participant ? participant.fullName : null,
                institution: participant ? participant.institution : null,
                email: participant ? participant.email : null,
            };
        })
        .sort((a, b) => {
            if (a.isLeader !== b.isLeader) {
                return a.isLeader ? -1 : 1;
            }
            return String(a.fullName).localeCompare(String(b.fullName));
        });

    return {
        ...team,
        competitionName: competition ? competition.name : null,
        members,
    };
}

module.exports = { getTeamIfMember, getTeamDetail };
