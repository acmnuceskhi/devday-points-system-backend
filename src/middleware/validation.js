const { HttpError } = require("../utils/httpError");

function validate(schema, source = "body") {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);

        if (!result.success) {
            const messages = result.error.issues.map((issue) => issue.message).join(", ");
            return next(new HttpError(400, messages || "Invalid request payload"));
        }

        req[source] = result.data;
        next();
    };
}

module.exports = { validate };
