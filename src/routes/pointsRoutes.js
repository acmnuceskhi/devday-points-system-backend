const express = require("express");
const {
    mySummary,
    myActivities,
    leaderboard,
} = require("../controllers/pointsController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const { paginationQuerySchema } = require("../validators/pointsValidators");

const router = express.Router();

router.get("/leaderboard", validate(paginationQuerySchema, "query"), asyncHandler(leaderboard));
router.get("/me/summary", requireAuth, asyncHandler(mySummary));
router.get("/me/activities", requireAuth, asyncHandler(myActivities));

module.exports = { pointsRoutes: router };
