class HttpError extends Error {
    constructor(status, message, options = {}) {
        super(message);
        this.status = status;
        this.code = options.code || null;
        this.details = options.details || null;
    }
}

module.exports = { HttpError };
