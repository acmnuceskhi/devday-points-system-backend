const { rateLimit } = require("express-rate-limit");

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: {
            message: "Too many login attempts, please try again later.",
            status: 429,
        },
    },
});

const signupRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: {
            message: "Too many signup requests, please try again later.",
            status: 429,
        },
    },
});

const signupVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: {
            message: "Too many verification attempts, please try again later.",
            status: 429,
        },
    },
});

module.exports = {
    apiLimiter,
    loginLimiter,
    signupRequestLimiter,
    signupVerifyLimiter,
};
