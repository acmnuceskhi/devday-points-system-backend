const dotenv = require("dotenv");

dotenv.config();

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

const env = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: toNumber(process.env.PORT, 3000),
    SUPABASE_URL:
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_KEY ||
        "",
    JWT_SECRET: process.env.JWT_SECRET || "devday-local-secret",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    ALLOW_EMPTY_PASSWORD_LOGIN:
        (process.env.ALLOW_EMPTY_PASSWORD_LOGIN || "true").toLowerCase() === "true",
};

function validateEnv() {
    if (!env.SUPABASE_URL) {
        throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in environment");
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
            "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY/SUPABASE_KEY) in environment"
        );
    }

    if (!env.JWT_SECRET || env.JWT_SECRET.length < 12) {
        throw new Error("JWT_SECRET must be set and at least 12 characters");
    }
}

module.exports = { env, validateEnv };
