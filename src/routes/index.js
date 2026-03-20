const express = require("express");
const { authRoutes } = require("./authRoutes");
const { participantRoutes } = require("./participantRoutes");
const { competitionRoutes } = require("./competitionRoutes");
const { teamRoutes } = require("./teamRoutes");
const { pointsRoutes } = require("./pointsRoutes");
const { pointsAdminRoutes } = require("./pointsAdminRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/participants", participantRoutes);
router.use("/competitions", competitionRoutes);
router.use("/teams", teamRoutes);
router.use("/points", pointsRoutes);
router.use("/points/admin", pointsAdminRoutes);

module.exports = { apiRoutes: router };
