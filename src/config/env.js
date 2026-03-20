const dotenv = require("dotenv");

dotenv.config();

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

const env = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: toNumber(process.env.PORT, 3000),
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "devday-local-secret",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    ALLOW_EMPTY_PASSWORD_LOGIN:
        (process.env.ALLOW_EMPTY_PASSWORD_LOGIN || "true").toLowerCase() === "true",
};

function validateEnv() {
    if (!env.DATABASE_URL) {
        throw new Error("Missing DATABASE_URL in environment");
    }

    if (!env.JWT_SECRET || env.JWT_SECRET.length < 12) {
        throw new Error("JWT_SECRET must be set and at least 12 characters");
    }
}

module.exports = { env, validateEnv };
