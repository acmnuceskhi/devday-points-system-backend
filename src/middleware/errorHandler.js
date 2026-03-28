function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const message = err.message || "Internal server error";
    const code = err.code || null;
    const details = err.details || null;

    if (status >= 500) {
        console.error("Unhandled error", err);
    }

    res.status(status).json({
        error: {
            message,
            status,
            code,
            details,
        },
    });
}

module.exports = { errorHandler };
