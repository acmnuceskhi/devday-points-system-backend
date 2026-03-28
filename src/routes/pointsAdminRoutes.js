const express = require("express");
const {
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
    approveSubmission,
    rejectSubmission,
    auditLogs,
} = require("../controllers/pointsAdminController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const {
    activityTypeListQuerySchema,
    createActivityBodySchema,
    updateActivityBodySchema,
    toggleActivityBodySchema,
    activityIdParamSchema,
    markCompletionBodySchema,
    markCompletionBatchBodySchema,
    completionIdParamSchema,
    revokeCompletionBodySchema,
    adjustPointsBodySchema,
    auditLogQuerySchema,
    participantDetailParamSchema,
    pendingSubmissionQuerySchema,
    activitySubmissionsQuerySchema,
    submissionIdParamSchema,
    reviewSubmissionBodySchema,
} = require("../validators/pointsValidators");

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/activities", validate(activityTypeListQuerySchema, "query"), asyncHandler(activities));
router.get("/activity-types", validate(activityTypeListQuerySchema, "query"), asyncHandler(activities));
router.get("/activity-kinds", asyncHandler(activityKinds));

router.post("/activities", validate(createActivityBodySchema), asyncHandler(create));
router.post("/activity-types", validate(createActivityBodySchema), asyncHandler(create));

router.patch(
    "/activities/:activityId",
    validate(activityIdParamSchema, "params"),
    validate(updateActivityBodySchema),
    asyncHandler(update)
);
router.patch(
    "/activity-types/:activityId",
    validate(activityIdParamSchema, "params"),
    validate(updateActivityBodySchema),
    asyncHandler(update)
);

router.patch(
    "/activities/:activityId/status",
    validate(activityIdParamSchema, "params"),
    validate(toggleActivityBodySchema),
    asyncHandler(setStatus)
);
router.patch(
    "/activity-types/:activityId/status",
    validate(activityIdParamSchema, "params"),
    validate(toggleActivityBodySchema),
    asyncHandler(setStatus)
);

router.post("/completions", validate(markCompletionBodySchema), asyncHandler(markCompletion));
router.post(
    "/completions/batch",
    validate(markCompletionBatchBodySchema),
    asyncHandler(markCompletionBatch)
);
router.delete(
    "/completions/:completionId",
    validate(completionIdParamSchema, "params"),
    validate(revokeCompletionBodySchema),
    asyncHandler(revokeCompletion)
);

router.post("/adjustments", validate(adjustPointsBodySchema), asyncHandler(adjustPoints));
router.get(
    "/participants/:participantId/details",
    validate(participantDetailParamSchema, "params"),
    asyncHandler(participantDetails)
);
router.get(
    "/submissions/pending",
    validate(pendingSubmissionQuerySchema, "query"),
    asyncHandler(pendingSubmissions)
);
router.get(
    "/submissions/by-activity",
    validate(activitySubmissionsQuerySchema, "query"),
    asyncHandler(submissionsByActivity)
);
router.post(
    "/submissions/:submissionId/approve",
    validate(submissionIdParamSchema, "params"),
    validate(reviewSubmissionBodySchema),
    asyncHandler(approveSubmission)
);
router.post(
    "/submissions/:submissionId/reject",
    validate(submissionIdParamSchema, "params"),
    validate(reviewSubmissionBodySchema),
    asyncHandler(rejectSubmission)
);
router.get("/audit-logs", validate(auditLogQuerySchema, "query"), asyncHandler(auditLogs));

module.exports = { pointsAdminRoutes: router };
