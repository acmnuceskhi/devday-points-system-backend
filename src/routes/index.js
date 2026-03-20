const express = require("express");
const { authRoutes } = require("./authRoutes");
const { participantRoutes } = require("./participantRoutes");
const { competitionRoutes } = require("./competitionRoutes");
const { teamRoutes } = require("./teamRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/participants", participantRoutes);
router.use("/competitions", competitionRoutes);
router.use("/teams", teamRoutes);

module.exports = { apiRoutes: router };
