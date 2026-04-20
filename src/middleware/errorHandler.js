function getPublicErrorMessage(status) {
    if (status === 400) return "Request could not be processed.";
    if (status === 401) return "Authentication failed.";
    if (status === 403) return "You do not have permission to perform this action.";
    if (status === 404) return "Requested resource was not found.";
    if (status === 409) return "Request could not be completed due to a conflict.";
    if (status === 422) return "Some request fields are invalid.";
    if (status === 429) return "Too many requests. Please try again shortly.";
    if (status >= 500) return "Internal server error.";
    return "Request failed.";
}

function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const internalMessage =
        (typeof err?.message === "string" && err.message.trim()) ||
        (typeof err === "string" && err.trim()) ||
        "Internal server error";
    const publicMessage = getPublicErrorMessage(status);
    const code = err.code || null;
    const details = err.details || null;

    const logPayload = {
        method: req.method,
        path: req.originalUrl,
        status,
        code,
        internalMessage,
        details,
    };

    if (status >= 500) {
        console.error("Unhandled error:", internalMessage, logPayload, err);
    } else {
        console.warn("Handled request error:", internalMessage, logPayload);
    }

    res.status(status).json({
        error: {
            message: publicMessage,
            status,
            code,
            details,
        },
    });
}

module.exports = { errorHandler };
