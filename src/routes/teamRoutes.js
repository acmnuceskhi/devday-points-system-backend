const express = require("express");
const { detail } = require("../controllers/teamController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/:id", requireAuth, asyncHandler(detail));

module.exports = { teamRoutes: router };
