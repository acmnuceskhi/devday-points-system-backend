const { z } = require("zod");

const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

const activityIdParamSchema = z.object({
    activityId: z.string().uuid("Invalid activity id"),
});

const submissionIdParamSchema = z.object({
    submissionId: z.string().uuid("Invalid submission id"),
});

const completionIdParamSchema = z.object({
    completionId: z.string().uuid("Invalid completion id"),
});

const createActivityBodySchema = z.object({
    code: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[A-Z0-9_]+$/, "Code must contain uppercase letters, numbers, or underscore")
        .transform((value) => value.trim())
        .optional(),
    name: z.string().min(2).max(100).transform((value) => value.trim()),
    description: z.string().max(1000).optional(),
    points: z.number().int().min(1).max(1000),
    activityTypeId: z.string().uuid("Invalid activity type id"),
    correctAnswerCanonical: z.string().trim().min(1).max(300).optional(),
    isActive: z.boolean().default(true),
});

const updateActivityBodySchema = z
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
        activityTypeId: z.string().uuid("Invalid activity type id").optional(),
        correctAnswerCanonical: z.string().trim().min(1).max(300).nullable().optional(),
    })
    .refine(
        (value) =>
            value.code !== undefined ||
            value.name !== undefined ||
            value.description !== undefined ||
            value.points !== undefined ||
            value.activityTypeId !== undefined ||
            value.correctAnswerCanonical !== undefined,
        { message: "At least one field is required" }
    );

const toggleActivityBodySchema = z.object({
    isActive: z.boolean(),
});

const markCompletionBodySchema = z.object({
    participantId: z.string().uuid("Invalid participant id"),
    activityId: z.string().uuid("Invalid activity id"),
    note: z.string().max(1000).optional(),
});

const markCompletionBatchBodySchema = z.object({
    participantIds: z.array(z.string().uuid("Invalid participant id")).min(1).max(500),
    activityId: z.string().uuid("Invalid activity id"),
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

const submitActivityBodySchema = z
    .object({
        activityId: z.string().uuid("Invalid activity id"),
        submissionLink: z.string().url("Invalid submission link").optional(),
        submissionText: z.string().trim().min(1).max(300).optional(),
        answerText: z.string().trim().min(1).max(300).optional(),
    })
    .refine(
        (value) =>
            Boolean(value.submissionLink) ||
            Boolean(value.submissionText) ||
            Boolean(value.answerText),
        { message: "Provide submissionLink, submissionText, or answerText" }
    );

const participantDetailParamSchema = z.object({
    participantId: z.string().uuid("Invalid participant id"),
});

const competitionIdParamSchema = z.object({
    competitionId: z.string().uuid("Invalid competition id"),
});

const pendingSubmissionQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    participantId: z.string().uuid("Invalid participant id").optional(),
});

const activitySubmissionsQuerySchema = z.object({
    activityId: z.string().uuid("Invalid activity id"),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

const reviewSubmissionBodySchema = z.object({
    note: z.string().max(1000).optional(),
});

const competitionActivityPointsDefaultBodySchema = z.object({
    points: z.number().int().min(0).max(1000),
});

const competitionActivityPointsOverrideBodySchema = z.object({
    points: z.number().int().min(0).max(1000),
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
    activityIdParamSchema,
    submissionIdParamSchema,
    completionIdParamSchema,
    createActivityBodySchema,
    updateActivityBodySchema,
    toggleActivityBodySchema,
    markCompletionBodySchema,
    markCompletionBatchBodySchema,
    revokeCompletionBodySchema,
    adjustPointsBodySchema,
    submitActivityBodySchema,
    participantDetailParamSchema,
    competitionIdParamSchema,
    pendingSubmissionQuerySchema,
    activitySubmissionsQuerySchema,
    reviewSubmissionBodySchema,
    competitionActivityPointsDefaultBodySchema,
    competitionActivityPointsOverrideBodySchema,
    auditLogQuerySchema,
    activityTypeListQuerySchema,
};
