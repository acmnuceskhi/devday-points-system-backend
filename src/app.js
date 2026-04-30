const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler } = require("./middleware/errorHandler");
const { notFound } = require("./middleware/notFound");
const { env } = require("./config/env");
const { apiRoutes } = require("./routes");

const app = express();

function buildAllowedOrigins(originValue) {
    const fromEnv = String(originValue || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const defaults = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ];

    const all = [...defaults, ...fromEnv];
    const exact = new Set(all.filter((o) => !o.startsWith("*-")));
    const wildcards = all
        .filter((o) => o.startsWith("*-"))
        .map((o) => o.slice(2)); // "*-foo.com" → "foo.com"

    return { exact, wildcards };
}

const allowedOrigins = buildAllowedOrigins(env.FRONTEND_ORIGIN);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }

            if (allowedOrigins.exact.has(origin)) {
                callback(null, true);
                return;
            }

            const host = origin.replace(/^https?:\/\//, "");
            if (allowedOrigins.wildcards.some((w) => host.endsWith(w))) {
                callback(null, true);
                return;
            }

            callback(new Error("CORS: origin not allowed"));
        },
        credentials: true,
    })
);
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(apiLimiter);

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.use("/api/v1", apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = { app };
