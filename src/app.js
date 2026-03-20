const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler } = require("./middleware/errorHandler");
const { notFound } = require("./middleware/notFound");
const { env } = require("./config/env");
const { apiRoutes } = require("./routes");

const app = express();

app.use(
    cors({
        origin: env.FRONTEND_ORIGIN,
        credentials: true,
    })
);
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
