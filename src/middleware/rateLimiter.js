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

module.exports = { apiLimiter, loginLimiter };
