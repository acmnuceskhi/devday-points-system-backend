const { z } = require("zod");

const loginBodySchema = z.object({
    email: z.email("Provide a valid email").transform((value) => value.toLowerCase().trim()),
    password: z.string().default(""),
});

const signupRequestBodySchema = z.object({
    email: z.email("Provide a valid email").transform((value) => value.toLowerCase().trim()),
    fullName: z.string().trim().min(2).max(100),
});

const signupVerifyBodySchema = z
    .object({
        email: z.email("Provide a valid email").transform((value) => value.toLowerCase().trim()),
        token: z.string().min(32).max(256),
        password: z.string().min(8).max(72),
        confirmPassword: z.string().min(8).max(72),
    })
    .refine((value) => value.password === value.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

module.exports = { loginBodySchema, signupRequestBodySchema, signupVerifyBodySchema };
