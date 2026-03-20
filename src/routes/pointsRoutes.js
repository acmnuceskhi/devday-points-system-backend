const express = require("express");
const {
    mySummary,
    myActivities,
    leaderboard,
    submitMyLink,
    mySubmissions,
} = require("../controllers/pointsController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const {
    paginationQuerySchema,
    submitLinkBodySchema,
} = require("../validators/pointsValidators");

const router = express.Router();

router.get("/leaderboard", validate(paginationQuerySchema, "query"), asyncHandler(leaderboard));
router.get("/me/summary", requireAuth, asyncHandler(mySummary));
router.get("/me/activities", requireAuth, asyncHandler(myActivities));
router.post("/me/submissions", requireAuth, validate(submitLinkBodySchema), asyncHandler(submitMyLink));
router.get("/me/submissions", requireAuth, asyncHandler(mySubmissions));

module.exports = { pointsRoutes: router };
