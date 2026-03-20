const { z } = require("zod");

const loginBodySchema = z.object({
    email: z.email("Provide a valid email").transform((value) => value.toLowerCase().trim()),
    password: z.string().default(""),
});

module.exports = { loginBodySchema };
