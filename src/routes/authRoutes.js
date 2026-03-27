const express = require("express");
const {
	login,
	adminLogin,
	signupRequest,
	signupVerify,
} = require("../controllers/authController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { validate } = require("../middleware/validation");
const {
	loginLimiter,
	signupRequestLimiter,
	signupVerifyLimiter,
} = require("../middleware/rateLimiter");
const {
	loginBodySchema,
	signupRequestBodySchema,
	signupVerifyBodySchema,
} = require("../validators/authValidators");

const router = express.Router();

router.post("/login", loginLimiter, validate(loginBodySchema), asyncHandler(login));
router.post("/admin/login", loginLimiter, validate(loginBodySchema), asyncHandler(adminLogin));
router.post("/signup/request", signupRequestLimiter, validate(signupRequestBodySchema), asyncHandler(signupRequest));
router.post("/signup/verify", signupVerifyLimiter, validate(signupVerifyBodySchema), asyncHandler(signupVerify));

module.exports = { authRoutes: router };
