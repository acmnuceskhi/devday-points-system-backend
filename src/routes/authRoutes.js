const express = require("express");
const { login, adminLogin } = require("../controllers/authController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { validate } = require("../middleware/validation");
const { loginLimiter } = require("../middleware/rateLimiter");
const { loginBodySchema } = require("../validators/authValidators");

const router = express.Router();

router.post("/login", loginLimiter, validate(loginBodySchema), asyncHandler(login));
router.post("/admin/login", loginLimiter, validate(loginBodySchema), asyncHandler(adminLogin));

module.exports = { authRoutes: router };
