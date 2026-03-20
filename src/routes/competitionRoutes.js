const express = require("express");
const {
    list,
    detail,
    venues,
} = require("../controllers/competitionController");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(list));
router.get("/:id", asyncHandler(detail));
router.get("/:id/venues", asyncHandler(venues));

module.exports = { competitionRoutes: router };
