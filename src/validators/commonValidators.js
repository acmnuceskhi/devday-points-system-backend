const { z } = require("zod");

const idParamSchema = z.object({
    id: z.string().min(1),
});

const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

module.exports = { idParamSchema, paginationSchema };
