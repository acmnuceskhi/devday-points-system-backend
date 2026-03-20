const { randomUUID } = require("node:crypto");
const { prisma, Prisma } = require("../db/prisma");
const { HttpError } = require("../utils/httpError");

async function getMyPointsSummary(participantId) {
    const data = await prisma.$queryRaw`
        SELECT "participantId", "totalPoints", "updatedAt"
        FROM "PointsSummary"
        WHERE "participantId" = ${participantId}
        LIMIT 1
    `;

    if (!data[0]) {
        return {
            participantId,
            totalPoints: 0,
            updatedAt: null,
        };
    }

    return data[0];
}

async function getMyActivityProgress(participantId) {
    const data = await prisma.$queryRaw`
        SELECT
            at.id,
            at.code,
            at.name,
            at.description,
            at.points,
            at."isActive",
            pac."completedAt",
            pac.note,
            CASE WHEN pac.id IS NULL THEN false ELSE true END AS "isCompleted"
        FROM "ActivityType" at
        LEFT JOIN "ParticipantActivityCompletion" pac
            ON pac."activityTypeId" = at.id
            AND pac."participantId" = ${participantId}
        ORDER BY at."isActive" DESC, at.name ASC
    `;

    return data;
}

async function getLeaderboard(limit, offset) {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 20;
    const safeOffset = Number.isFinite(Number(offset)) ? Math.trunc(Number(offset)) : 0;
    const limitSql = Prisma.raw(String(Math.max(1, safeLimit)));
    const offsetSql = Prisma.raw(String(Math.max(0, safeOffset)));

    const data = await prisma.$queryRaw`
        SELECT
            p.id AS "participantId",
            p."fullName",
            p.institution,
            COALESCE(ps."totalPoints", 0) AS "totalPoints"
        FROM "Participant" p
        LEFT JOIN "PointsSummary" ps ON ps."participantId" = p.id
        ORDER BY COALESCE(ps."totalPoints", 0) DESC, p."fullName" ASC
        LIMIT ${limitSql}
        OFFSET ${offsetSql}
    `;

    return data;
}

async function listActivityTypes(includeInactive) {
    const data = includeInactive
        ? await prisma.$queryRaw`
            SELECT id, code, name, description, points, "isActive", "createdAt", "updatedAt"
            FROM "ActivityType"
            ORDER BY "isActive" DESC, name ASC
        `
        : await prisma.$queryRaw`
            SELECT id, code, name, description, points, "isActive", "createdAt", "updatedAt"
            FROM "ActivityType"
            WHERE "isActive" = true
            ORDER BY name ASC
        `;

    return data;
}

async function getActivityTypeById(activityTypeId) {
    const data = await prisma.$queryRaw`
        SELECT id, code, name, description, points, "isActive", "createdAt", "updatedAt"
        FROM "ActivityType"
        WHERE id = ${activityTypeId}
        LIMIT 1
    `;

    return data[0] || null;
}

async function createActivityType(payload, actorStaffProfileId) {
    const existing = await prisma.$queryRaw`
        SELECT id
        FROM "ActivityType"
        WHERE code = ${payload.code}
        LIMIT 1
    `;

    if (existing[0]) {
        throw new HttpError(409, "Activity code already exists");
    }

    const id = randomUUID();
    const row = (await prisma.$queryRaw`
        INSERT INTO "ActivityType"
            (id, code, name, description, points, "isActive", "createdByStaffProfileId", "updatedByStaffProfileId", "updatedAt")
        VALUES
            (${id}, ${payload.code}, ${payload.name}, ${payload.description || null}, ${payload.points}, ${payload.isActive}, ${actorStaffProfileId}, ${actorStaffProfileId}, NOW())
        RETURNING id, code, name, description, points, "isActive", "createdAt", "updatedAt"
    `)[0];

    await createAuditLog({
        actorStaffProfileId,
        actionType: "ACTIVITY_TYPE_CREATED",
        targetType: "ActivityType",
        targetId: row.id,
        note: null,
        payload: row,
    });

    return row;
}

async function updateActivityType(activityTypeId, payload, actorStaffProfileId) {
    const current = await getActivityTypeById(activityTypeId);

    if (!current) {
        throw new HttpError(404, "Activity type not found");
    }

    const next = {
        code: payload.code ?? current.code,
        name: payload.name ?? current.name,
        description: payload.description === undefined ? current.description : payload.description,
        points: payload.points ?? current.points,
    };

    if (next.code !== current.code) {
        const existing = await prisma.$queryRaw`
            SELECT id
            FROM "ActivityType"
            WHERE code = ${next.code}
              AND id <> ${activityTypeId}
            LIMIT 1
        `;

        if (existing[0]) {
            throw new HttpError(409, "Activity code already exists");
        }
    }

    const row = (await prisma.$queryRaw`
        UPDATE "ActivityType"
        SET
            code = ${next.code},
            name = ${next.name},
            description = ${next.description || null},
            points = ${next.points},
            "updatedByStaffProfileId" = ${actorStaffProfileId},
            "updatedAt" = NOW()
        WHERE id = ${activityTypeId}
        RETURNING id, code, name, description, points, "isActive", "createdAt", "updatedAt"
    `)[0];

    await createAuditLog({
        actorStaffProfileId,
        actionType: "ACTIVITY_TYPE_UPDATED",
        targetType: "ActivityType",
        targetId: row.id,
        note: null,
        payload: {
            before: current,
            after: row,
        },
    });

    return row;
}

async function toggleActivityType(activityTypeId, isActive, actorStaffProfileId) {
    const current = await getActivityTypeById(activityTypeId);

    if (!current) {
        throw new HttpError(404, "Activity type not found");
    }

    const row = (await prisma.$queryRaw`
        UPDATE "ActivityType"
        SET
            "isActive" = ${isActive},
            "updatedByStaffProfileId" = ${actorStaffProfileId},
            "updatedAt" = NOW()
        WHERE id = ${activityTypeId}
        RETURNING id, code, name, description, points, "isActive", "createdAt", "updatedAt"
    `)[0];

    await createAuditLog({
        actorStaffProfileId,
        actionType: "ACTIVITY_TYPE_TOGGLED",
        targetType: "ActivityType",
        targetId: row.id,
        note: null,
        payload: {
            before: current.isActive,
            after: row.isActive,
        },
    });

    return row;
}

async function markActivityCompletion(input, actorStaffProfileId) {
    return prisma.$transaction(async (tx) => {
        const participant = (await tx.$queryRaw`
            SELECT id
            FROM "Participant"
            WHERE id = ${input.participantId}
            LIMIT 1
        `)[0];

        if (!participant) {
            throw new HttpError(404, "Participant not found");
        }

        const activityType = (await tx.$queryRaw`
            SELECT id, code, name, points, "isActive"
            FROM "ActivityType"
            WHERE id = ${input.activityTypeId}
            LIMIT 1
        `)[0];

        if (!activityType) {
            throw new HttpError(404, "Activity type not found");
        }

        if (!activityType.isActive) {
            throw new HttpError(400, "Activity type is inactive");
        }

        const existingCompletion = (await tx.$queryRaw`
            SELECT id
            FROM "ParticipantActivityCompletion"
            WHERE "participantId" = ${input.participantId}
              AND "activityTypeId" = ${input.activityTypeId}
            LIMIT 1
        `)[0];

        if (existingCompletion) {
            throw new HttpError(409, "Activity already marked for participant");
        }

        const completionId = randomUUID();

        const completion = (await tx.$queryRaw`
            INSERT INTO "ParticipantActivityCompletion"
                (id, "participantId", "activityTypeId", "markedByStaffProfileId", note)
            VALUES
                (${completionId}, ${input.participantId}, ${input.activityTypeId}, ${actorStaffProfileId}, ${input.note || null})
            RETURNING id, "participantId", "activityTypeId", "completedAt", note
        `)[0];

        const ledgerId = randomUUID();
        const metadata = {
            activityCode: activityType.code,
            activityName: activityType.name,
        };

        await tx.$queryRaw`
            INSERT INTO "PointsLedger"
                (id, "participantId", "entryType", "pointsDelta", "sourceCompletionId", "actorStaffProfileId", metadata)
            VALUES
                (${ledgerId}, ${input.participantId}, ${"MANUAL_ACTIVITY"}::"PointsLedgerEntryType", ${activityType.points}, ${completionId}, ${actorStaffProfileId}, ${metadata}::jsonb)
        `;

        const summary = (await tx.$queryRaw`
            INSERT INTO "PointsSummary" ("participantId", "totalPoints", "updatedAt")
            VALUES (${input.participantId}, ${activityType.points}, NOW())
            ON CONFLICT ("participantId")
            DO UPDATE SET
                "totalPoints" = "PointsSummary"."totalPoints" + EXCLUDED."totalPoints",
                "updatedAt" = NOW()
            RETURNING "participantId", "totalPoints", "updatedAt"
        `)[0];

        await tx.$queryRaw`
            INSERT INTO "PointsAuditLog"
                (id, "actorStaffProfileId", "actionType", "targetType", "targetId", note, payload)
            VALUES
                (
                    ${randomUUID()},
                    ${actorStaffProfileId},
                    ${"ACTIVITY_COMPLETION_MARKED"}::"PointsAuditActionType",
                    ${"ParticipantActivityCompletion"},
                    ${completion.id},
                    ${input.note || null},
                    ${JSON.stringify({
            participantId: input.participantId,
            activityTypeId: input.activityTypeId,
            points: activityType.points,
        })}::jsonb
                )
        `;

        return {
            completion,
            summary,
        };
    });
}

async function markActivityCompletionBatch(input, actorStaffProfileId) {
    const results = [];

    for (const participantId of input.participantIds) {
        try {
            const result = await markActivityCompletion(
                {
                    participantId,
                    activityTypeId: input.activityTypeId,
                    note: input.note,
                },
                actorStaffProfileId
            );

            results.push({
                participantId,
                success: true,
                result,
            });
        } catch (error) {
            results.push({
                participantId,
                success: false,
                error: error.message || "Failed to mark completion",
            });
        }
    }

    return {
        total: input.participantIds.length,
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
        results,
    };
}

async function revokeActivityCompletion(completionId, note, actorStaffProfileId) {
    return prisma.$transaction(async (tx) => {
        const completion = (await tx.$queryRaw`
            SELECT
                pac.id,
                pac."participantId",
                pac."activityTypeId",
                pac."completedAt",
                at.points
            FROM "ParticipantActivityCompletion" pac
            INNER JOIN "ActivityType" at ON at.id = pac."activityTypeId"
            WHERE pac.id = ${completionId}
            LIMIT 1
        `)[0];

        if (!completion) {
            throw new HttpError(404, "Activity completion not found");
        }

        await tx.$queryRaw`
            DELETE FROM "PointsLedger"
            WHERE "sourceCompletionId" = ${completionId}
        `;

        await tx.$queryRaw`
            DELETE FROM "ParticipantActivityCompletion"
            WHERE id = ${completionId}
        `;

        const summary = (await tx.$queryRaw`
            INSERT INTO "PointsSummary" ("participantId", "totalPoints", "updatedAt")
            VALUES (${completion.participantId}, ${-completion.points}, NOW())
            ON CONFLICT ("participantId")
            DO UPDATE SET
                "totalPoints" = "PointsSummary"."totalPoints" + EXCLUDED."totalPoints",
                "updatedAt" = NOW()
            RETURNING "participantId", "totalPoints", "updatedAt"
        `)[0];

        await tx.$queryRaw`
            INSERT INTO "PointsAuditLog"
                (id, "actorStaffProfileId", "actionType", "targetType", "targetId", note, payload)
            VALUES
                (
                    ${randomUUID()},
                    ${actorStaffProfileId},
                    ${"ACTIVITY_COMPLETION_REVOKED"}::"PointsAuditActionType",
                    ${"ParticipantActivityCompletion"},
                    ${completionId},
                    ${note || null},
                    ${JSON.stringify({
            participantId: completion.participantId,
            activityTypeId: completion.activityTypeId,
            pointsRemoved: completion.points,
        })}::jsonb
                )
        `;

        return {
            completionId,
            participantId: completion.participantId,
            pointsRemoved: completion.points,
            summary,
        };
    });
}

async function adjustParticipantPoints(input, actorStaffProfileId) {
    return prisma.$transaction(async (tx) => {
        const participant = (await tx.$queryRaw`
            SELECT id
            FROM "Participant"
            WHERE id = ${input.participantId}
            LIMIT 1
        `)[0];

        if (!participant) {
            throw new HttpError(404, "Participant not found");
        }

        await tx.$queryRaw`
            INSERT INTO "PointsLedger"
                (id, "participantId", "entryType", "pointsDelta", "actorStaffProfileId", metadata)
            VALUES
                (
                    ${randomUUID()},
                    ${input.participantId},
                    ${"ADJUSTMENT"}::"PointsLedgerEntryType",
                    ${input.pointsDelta},
                    ${actorStaffProfileId},
                    ${JSON.stringify({
            reason: input.reason,
        })}::jsonb
                )
        `;

        const summary = (await tx.$queryRaw`
            INSERT INTO "PointsSummary" ("participantId", "totalPoints", "updatedAt")
            VALUES (${input.participantId}, ${input.pointsDelta}, NOW())
            ON CONFLICT ("participantId")
            DO UPDATE SET
                "totalPoints" = "PointsSummary"."totalPoints" + EXCLUDED."totalPoints",
                "updatedAt" = NOW()
            RETURNING "participantId", "totalPoints", "updatedAt"
        `)[0];

        await tx.$queryRaw`
            INSERT INTO "PointsAuditLog"
                (id, "actorStaffProfileId", "actionType", "targetType", "targetId", note, payload)
            VALUES
                (
                    ${randomUUID()},
                    ${actorStaffProfileId},
                    ${"POINTS_ADJUSTED"}::"PointsAuditActionType",
                    ${"Participant"},
                    ${input.participantId},
                    ${input.reason || null},
                    ${JSON.stringify({
            participantId: input.participantId,
            pointsDelta: input.pointsDelta,
            reason: input.reason,
        })}::jsonb
                )
        `;

        return summary;
    });
}

async function getAuditLogs(filters) {
    const limit = Number.isFinite(Number(filters.limit)) ? Math.trunc(Number(filters.limit)) : 20;
    const offset = Number.isFinite(Number(filters.offset)) ? Math.trunc(Number(filters.offset)) : 0;
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const conditions = [];
    const values = [];

    if (filters.actionType) {
        values.push(filters.actionType);
        conditions.push(`pal."actionType" = $${values.length}::"PointsAuditActionType"`);
    }

    if (filters.actorStaffProfileId) {
        values.push(filters.actorStaffProfileId);
        conditions.push(`pal."actorStaffProfileId" = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
        SELECT
            pal.id,
            pal."actorStaffProfileId",
            pal."actionType",
            pal."targetType",
            pal."targetId",
            pal.note,
            pal.payload,
            pal."createdAt"
        FROM "PointsAuditLog" pal
        ${whereClause}
        ORDER BY pal."createdAt" DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `;

    const data = await prisma.$queryRawUnsafe(query, ...values);
    return data;
}

async function createAuditLog({
    actorStaffProfileId,
    actionType,
    targetType,
    targetId,
    note,
    payload,
}) {
    await prisma.$queryRaw`
        INSERT INTO "PointsAuditLog"
            (id, "actorStaffProfileId", "actionType", "targetType", "targetId", note, payload)
        VALUES
            (
                ${randomUUID()},
                ${actorStaffProfileId},
                ${actionType}::"PointsAuditActionType",
                ${targetType || null},
                ${targetId || null},
                ${note || null},
                ${JSON.stringify(payload || null)}::jsonb
            )
    `;
}

module.exports = {
    getMyPointsSummary,
    getMyActivityProgress,
    getLeaderboard,
    listActivityTypes,
    createActivityType,
    updateActivityType,
    toggleActivityType,
    markActivityCompletion,
    markActivityCompletionBatch,
    revokeActivityCompletion,
    adjustParticipantPoints,
    getAuditLogs,
};
