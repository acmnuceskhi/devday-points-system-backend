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
    SIGNUP_VERIFY_BASE_URL: process.env.SIGNUP_VERIFY_BASE_URL || "",
    SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
    // SMTP_PORT: toNumber(process.env.SMTP_PORT, 465),
    // SMTP_SECURE: (process.env.SMTP_SECURE || "true").toLowerCase() === "true",
    SMTP_USER: process.env.SMTP_USER || "",
    SMTP_PASS: process.env.SMTP_PASS || "",
    SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "",
    SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || "DevDay 2026",
    SYSTEM_STAFF_PROFILE_ID: process.env.SYSTEM_STAFF_PROFILE_ID || "",
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
