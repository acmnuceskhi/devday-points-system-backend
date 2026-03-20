const {
    listActivityTypes,
    createActivityType,
    updateActivityType,
    toggleActivityType,
    markActivityCompletion,
    markActivityCompletionBatch,
    revokeActivityCompletion,
    adjustParticipantPoints,
    getAuditLogs,
} = require("../services/pointsService");

function getActorStaffProfileId(req) {
    return req.staffProfile.id;
}

async function activityTypes(req, res) {
    const { includeInactive } = req.query;
    const rows = await listActivityTypes(includeInactive);
    res.json(rows);
}

async function createActivity(req, res) {
    const created = await createActivityType(req.body, getActorStaffProfileId(req));
    res.status(201).json(created);
}

async function updateActivity(req, res) {
    const updated = await updateActivityType(
        req.params.activityTypeId,
        req.body,
        getActorStaffProfileId(req)
    );

    res.json(updated);
}

async function setActivityStatus(req, res) {
    const updated = await toggleActivityType(
        req.params.activityTypeId,
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
    activityTypes,
    createActivity,
    updateActivity,
    setActivityStatus,
    markCompletion,
    markCompletionBatch,
    revokeCompletion,
    adjustPoints,
    auditLogs,
};
