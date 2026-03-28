const {
    listActivities,
    listActivityKinds,
    createActivity,
    updateActivity,
    toggleActivity,
    markActivityCompletion,
    markActivityCompletionBatch,
    revokeActivityCompletion,
    adjustParticipantPoints,
    getAuditLogs,
    getParticipantAdminDetails,
    listPendingSubmissions,
    listSubmissionsByActivity,
    getLatestSubmissionForParticipantActivity,
    getCompetitionActivityPointsConfig,
    setCompetitionActivityPointsDefault,
    setCompetitionActivityPointsOverride,
    clearCompetitionActivityPointsOverride,
    reviewSubmission,
} = require("../services/pointsService");

function getActorStaffProfileId(req) {
    return req.staffProfile.id;
}

async function activities(req, res) {
    const { includeInactive } = req.query;
    const rows = await listActivities(includeInactive);
    res.json(rows);
}

async function activityKinds(req, res) {
    const rows = await listActivityKinds();
    res.json(rows);
}

async function create(req, res) {
    const created = await createActivity(req.body, getActorStaffProfileId(req));
    res.status(201).json(created);
}

async function update(req, res) {
    const updated = await updateActivity(req.params.activityId, req.body, getActorStaffProfileId(req));
    res.json(updated);
}

async function setStatus(req, res) {
    const updated = await toggleActivity(
        req.params.activityId,
        req.body.isActive,
        getActorStaffProfileId(req)
    );

    res.json(updated);
}

async function markCompletion(req, res) {
    const result = await markActivityCompletion(req.body, getActorStaffProfileId(req));
    res.status(201).json(result);
}

async function markCompletionBatch(req, res) {
    const result = await markActivityCompletionBatch(req.body, getActorStaffProfileId(req));
    res.json(result);
}

async function revokeCompletion(req, res) {
    const result = await revokeActivityCompletion(
        req.params.completionId,
        req.body.note,
        getActorStaffProfileId(req)
    );

    res.json(result);
}

async function adjustPoints(req, res) {
    const result = await adjustParticipantPoints(req.body, getActorStaffProfileId(req));
    res.status(201).json(result);
}

async function participantDetails(req, res) {
    const result = await getParticipantAdminDetails(req.params.participantId);
    res.json(result);
}

async function pendingSubmissions(req, res) {
    const rows = await listPendingSubmissions(req.query);
    res.json(rows);
}

async function submissionsByActivity(req, res) {
    const rows = await listSubmissionsByActivity(req.query);
    res.json(rows);
}

async function latestParticipantActivitySubmission(req, res) {
    const result = await getLatestSubmissionForParticipantActivity(
        req.params.participantId,
        req.params.activityId
    );
    res.json(result);
}

async function competitionActivityPointsConfig(req, res) {
    const config = await getCompetitionActivityPointsConfig();
    res.json(config);
}

async function updateCompetitionActivityPointsDefault(req, res) {
    const config = await setCompetitionActivityPointsDefault(req.body.points);
    res.json(config);
}

async function updateCompetitionActivityPointsOverride(req, res) {
    const config = await setCompetitionActivityPointsOverride(req.params.competitionId, req.body.points);
    res.json(config);
}

async function deleteCompetitionActivityPointsOverride(req, res) {
    const config = await clearCompetitionActivityPointsOverride(req.params.competitionId);
    res.json(config);
}

async function approveSubmission(req, res) {
    const result = await reviewSubmission(
        req.params.submissionId,
        "APPROVED",
        getActorStaffProfileId(req),
        req.body.note
    );

    res.json(result);
}

async function rejectSubmission(req, res) {
    const result = await reviewSubmission(
        req.params.submissionId,
        "REJECTED",
        getActorStaffProfileId(req),
        req.body.note
    );

    res.json(result);
}

async function auditLogs(req, res) {
    const parsedLimit = Number(req.query.limit);
    const parsedOffset = Number(req.query.offset);

    const filters = {
        ...req.query,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
        offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
    };

    const rows = await getAuditLogs(filters);
    res.json(rows);
}

module.exports = {
    activities,
    activityKinds,
    create,
    update,
    setStatus,
    markCompletion,
    markCompletionBatch,
    revokeCompletion,
    adjustPoints,
    participantDetails,
    pendingSubmissions,
    submissionsByActivity,
    latestParticipantActivitySubmission,
    competitionActivityPointsConfig,
    updateCompetitionActivityPointsDefault,
    updateCompetitionActivityPointsOverride,
    deleteCompetitionActivityPointsOverride,
    approveSubmission,
    rejectSubmission,
    auditLogs,
};
