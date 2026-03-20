const express = require("express");
const { login } = require("../controllers/authController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { validate } = require("../middleware/validation");
const { loginLimiter } = require("../middleware/rateLimiter");
const { loginBodySchema } = require("../validators/authValidators");

const router = express.Router();

router.post("/login", loginLimiter, validate(loginBodySchema), asyncHandler(login));

module.exports = { authRoutes: router };
