const { supabase } = require("../db/supabase");

function throwDbError(context, error) {
    throw new Error(`${context}: ${error.message}`);
}

async function getParticipantByUserId(userId) {
    const { data, error } = await supabase
        .from("Participant")
        .select("id, userId, cnic, email, fullName, phone, institution, rollNumber, createdAt, updatedAt")
        .eq("userId", userId)
        .limit(1);

    if (error) {
        throwDbError("Failed to fetch participant profile", error);
    }

    return data[0] || null;
}

async function getParticipantCompetitions(participantId) {
    const { data: memberships, error: membershipsError } = await supabase
        .from("TeamMember")
        .select("teamId, isLeader, joinedAt")
        .eq("participantId", participantId);

    if (membershipsError) {
        throwDbError("Failed to fetch participant team memberships", membershipsError);
    }

    if (!memberships.length) {
        return [];
    }

    const teamIds = [...new Set(memberships.map((item) => item.teamId))];

    const { data: teams, error: teamsError } = await supabase
        .from("Team")
        .select("id, competitionId, name, paymentStatus")
        .in("id", teamIds);

    if (teamsError) {
        throwDbError("Failed to fetch teams", teamsError);
    }

    const competitionIds = [...new Set(teams.map((item) => item.competitionId))];
    const { data: competitions, error: competitionsError } = await supabase
        .from("Competition")
        .select("id, name, compDay, startTime, endTime")
        .in("id", competitionIds);

    if (competitionsError) {
        throwDbError("Failed to fetch competitions", competitionsError);
    }

    const { data: competitionVenues, error: competitionVenuesError } = await supabase
        .from("_CompetitionToVenue")
        .select("A, B")
        .in("A", competitionIds);

    if (competitionVenuesError) {
        throwDbError("Failed to fetch competition venues", competitionVenuesError);
    }

    const venueIds = [...new Set(competitionVenues.map((item) => item.B))];
    const { data: venues, error: venuesError } = venueIds.length
        ? await supabase.from("Venue").select("id, name").in("id", venueIds)
        : { data: [], error: null };

    if (venuesError) {
        throwDbError("Failed to fetch venues", venuesError);
    }

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
    const { data: participants, error: participantsError } = await supabase
        .from("Participant")
        .select("id, fullName, institution");

    if (participantsError) {
        throwDbError("Failed to fetch participants for rankings", participantsError);
    }

    const { data: memberships, error: membershipsError } = await supabase
        .from("TeamMember")
        .select("participantId, teamId");

    if (membershipsError) {
        throwDbError("Failed to fetch team memberships for rankings", membershipsError);
    }

    const teamIds = [...new Set(memberships.map((item) => item.teamId))];
    const { data: teams, error: teamsError } = teamIds.length
        ? await supabase.from("Team").select("id, competitionId").in("id", teamIds)
        : { data: [], error: null };

    if (teamsError) {
        throwDbError("Failed to fetch teams for rankings", teamsError);
    }

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
