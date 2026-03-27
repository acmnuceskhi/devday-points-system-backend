const express = require("express");
const {
    mySummary,
    myActivities,
    leaderboard,
    submitMySubmission,
    mySubmissions,
} = require("../controllers/pointsController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const {
    paginationQuerySchema,
    submitActivityBodySchema,
} = require("../validators/pointsValidators");

const router = express.Router();

router.get("/leaderboard", validate(paginationQuerySchema, "query"), asyncHandler(leaderboard));
router.get("/me/summary", requireAuth, asyncHandler(mySummary));
router.get("/me/activities", requireAuth, asyncHandler(myActivities));
router.post("/me/submissions", requireAuth, validate(submitActivityBodySchema), asyncHandler(submitMySubmission));
router.get("/me/submissions", requireAuth, asyncHandler(mySubmissions));

module.exports = { pointsRoutes: router };
