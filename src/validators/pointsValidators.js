const { z } = require("zod");

const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

const activityTypeIdParamSchema = z.object({
    activityTypeId: z.string().uuid("Invalid activity type id"),
});

const completionIdParamSchema = z.object({
    completionId: z.string().uuid("Invalid completion id"),
});

const createActivityTypeBodySchema = z.object({
    code: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[A-Z0-9_]+$/, "Code must contain uppercase letters, numbers, or underscore")
        .transform((value) => value.trim()),
    name: z.string().min(2).max(100).transform((value) => value.trim()),
    description: z.string().max(1000).optional(),
    points: z.number().int().min(1).max(1000),
    isActive: z.boolean().default(true),
});

const updateActivityTypeBodySchema = z
    .object({
        code: z
            .string()
            .min(2)
            .max(50)
            .regex(/^[A-Z0-9_]+$/, "Code must contain uppercase letters, numbers, or underscore")
            .transform((value) => value.trim())
            .optional(),
        name: z.string().min(2).max(100).transform((value) => value.trim()).optional(),
        description: z.string().max(1000).nullable().optional(),
        points: z.number().int().min(1).max(1000).optional(),
    })
    .refine(
        (value) =>
            value.code !== undefined ||
            value.name !== undefined ||
            value.description !== undefined ||
            value.points !== undefined,
        { message: "At least one field is required" }
    );

const toggleActivityTypeBodySchema = z.object({
    isActive: z.boolean(),
});

const markCompletionBodySchema = z.object({
    participantId: z.string().uuid("Invalid participant id"),
    activityTypeId: z.string().uuid("Invalid activity type id"),
    note: z.string().max(1000).optional(),
});

const markCompletionBatchBodySchema = z.object({
    participantIds: z.array(z.string().uuid("Invalid participant id")).min(1).max(500),
    activityTypeId: z.string().uuid("Invalid activity type id"),
    note: z.string().max(1000).optional(),
});

const revokeCompletionBodySchema = z.object({
    note: z.string().max(1000).optional(),
});

const adjustPointsBodySchema = z.object({
    participantId: z.string().uuid("Invalid participant id"),
    pointsDelta: z.number().int().min(-1000).max(1000).refine((value) => value !== 0, {
        message: "pointsDelta cannot be zero",
    }),
    reason: z.string().max(1000).optional(),
});

const auditLogQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    actionType: z
        .enum([
            "ACTIVITY_TYPE_CREATED",
            "ACTIVITY_TYPE_UPDATED",
            "ACTIVITY_TYPE_TOGGLED",
            "ACTIVITY_COMPLETION_MARKED",
            "ACTIVITY_COMPLETION_REVOKED",
            "POINTS_ADJUSTED",
        ])
        .optional(),
    actorStaffProfileId: z.string().uuid("Invalid staff profile id").optional(),
});

const activityTypeListQuerySchema = z.object({
    includeInactive: z
        .union([z.literal("true"), z.literal("false"), z.boolean()])
        .optional()
        .transform((value) => value === true || value === "true"),
});

module.exports = {
    paginationQuerySchema,
    activityTypeIdParamSchema,
    completionIdParamSchema,
    createActivityTypeBodySchema,
    updateActivityTypeBodySchema,
    toggleActivityTypeBodySchema,
    markCompletionBodySchema,
    markCompletionBatchBodySchema,
    revokeCompletionBodySchema,
    adjustPointsBodySchema,
    auditLogQuerySchema,
    activityTypeListQuerySchema,
};
