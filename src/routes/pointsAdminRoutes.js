const express = require("express");
const {
    activityTypes,
    createActivity,
    updateActivity,
    setActivityStatus,
    markCompletion,
    markCompletionBatch,
    revokeCompletion,
    adjustPoints,
    auditLogs,
} = require("../controllers/pointsAdminController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const {
    activityTypeListQuerySchema,
    createActivityTypeBodySchema,
    updateActivityTypeBodySchema,
    toggleActivityTypeBodySchema,
    activityTypeIdParamSchema,
    markCompletionBodySchema,
    markCompletionBatchBodySchema,
    completionIdParamSchema,
    revokeCompletionBodySchema,
    adjustPointsBodySchema,
    auditLogQuerySchema,
} = require("../validators/pointsValidators");

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
    "/activity-types",
    validate(activityTypeListQuerySchema, "query"),
    asyncHandler(activityTypes)
);
router.post("/activity-types", validate(createActivityTypeBodySchema), asyncHandler(createActivity));
router.patch(
    "/activity-types/:activityTypeId",
    validate(activityTypeIdParamSchema, "params"),
    validate(updateActivityTypeBodySchema),
    asyncHandler(updateActivity)
);
router.patch(
    "/activity-types/:activityTypeId/status",
    validate(activityTypeIdParamSchema, "params"),
    validate(toggleActivityTypeBodySchema),
    asyncHandler(setActivityStatus)
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
router.get("/audit-logs", validate(auditLogQuerySchema, "query"), asyncHandler(auditLogs));

module.exports = { pointsAdminRoutes: router };
