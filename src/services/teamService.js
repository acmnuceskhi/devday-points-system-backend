const { supabase } = require("../db/supabase");

function throwDbError(context, error) {
    throw new Error(`${context}: ${error.message}`);
}

async function getTeamIfMember(teamId, participantId) {
    const { data: rows, error } = await supabase
        .from("TeamMember")
        .select("teamId")
        .eq("teamId", teamId)
        .eq("participantId", participantId)
        .limit(1);

    if (error) {
        throwDbError("Failed to verify team membership", error);
    }

    return rows[0] || null;
}

async function getTeamDetail(teamId) {
    const { data: teamRows, error: teamError } = await supabase
        .from("Team")
        .select(
            "id, name, competitionId, referenceId, paymentStatus, paymentProofUrl, paymentMethod, paymentDate, declaredTID, amountPaid, isEarlyBird"
        )
        .eq("id", teamId)
        .limit(1);

    if (teamError) {
        throwDbError("Failed to fetch team details", teamError);
    }

    const team = teamRows[0] || null;

    if (!team) {
        return null;
    }

    const { data: competitions, error: competitionError } = await supabase
        .from("Competition")
        .select("id, name")
        .eq("id", team.competitionId)
        .limit(1);

    if (competitionError) {
        throwDbError("Failed to fetch team competition details", competitionError);
    }

    const competition = competitions[0] || null;

    const { data: memberships, error: membershipsError } = await supabase
        .from("TeamMember")
        .select("id, participantId, isLeader, joinedAt")
        .eq("teamId", teamId);

    if (membershipsError) {
        throwDbError("Failed to fetch team memberships", membershipsError);
    }

    const participantIds = [...new Set(memberships.map((item) => item.participantId))];
    const { data: participants, error: participantsError } = participantIds.length
        ? await supabase
            .from("Participant")
            .select("id, fullName, institution, email")
            .in("id", participantIds)
        : { data: [], error: null };

    if (participantsError) {
        throwDbError("Failed to fetch team participant details", participantsError);
    }

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
