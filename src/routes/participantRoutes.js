const express = require("express");
const {
    me,
    myCompetitions,
    rankings,
} = require("../controllers/participantController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/me", requireAuth, asyncHandler(me));
router.get("/me/competitions", requireAuth, asyncHandler(myCompetitions));
router.get("/rankings", asyncHandler(rankings));

module.exports = { participantRoutes: router };
