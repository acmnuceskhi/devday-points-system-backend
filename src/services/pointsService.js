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
            a.id,
            a.code,
            a.name,
            a.description,
            a.points,
            a."isActive",
            at.code AS "activityTypeCode",
            pac.id AS "completionId",
            pac."completedAt",
            pac.note,
            pac."submissionLink" AS "approvedSubmissionLink",
            CASE WHEN pac.id IS NULL THEN false ELSE true END AS "isCompleted",
            sub.id AS "submissionId",
            sub.status AS "submissionStatus",
            sub."submissionLink" AS "submittedLink",
            sub."submittedAt"
        FROM "Activity" a
        INNER JOIN "ActivityType" at ON at.id = a."activityTypeId"
        LEFT JOIN "ParticipantActivityCompletion" pac
            ON pac."activityId" = a.id
            AND pac."participantId" = ${participantId}
        LEFT JOIN LATERAL (
            SELECT s.id, s.status, s."submissionLink", s."submittedAt"
            FROM "ActivitySubmission" s
            WHERE s."participantId" = ${participantId}
              AND s."activityId" = a.id
            ORDER BY s."submittedAt" DESC
            LIMIT 1
        ) sub ON TRUE
        ORDER BY a."isActive" DESC, a.name ASC
    `;

    return data;
}

async function submitMyActivityLink(participantId, input) {
    return prisma.$transaction(async (tx) => {
        const activity = (await tx.$queryRaw`
            SELECT a.id, a.code, a.name, a.points, a."isActive", at.code AS "activityTypeCode"
            FROM "Activity" a
            INNER JOIN "ActivityType" at ON at.id = a."activityTypeId"
            WHERE a.id = ${input.activityId}
            LIMIT 1
        `)[0];

        if (!activity) {
            throw new HttpError(404, "Activity not found");
        }

        if (!activity.isActive) {
            throw new HttpError(400, "Activity is inactive");
        }

        if (activity.activityTypeCode !== "LINK_BASED") {
            throw new HttpError(400, "This activity does not accept link submissions");
        }

        const completion = (await tx.$queryRaw`
            SELECT id
            FROM "ParticipantActivityCompletion"
            WHERE "participantId" = ${participantId}
              AND "activityId" = ${input.activityId}
            LIMIT 1
        `)[0];

        if (completion) {
            throw new HttpError(409, "Activity already completed for participant");
        }

        const existingPending = (await tx.$queryRaw`
            SELECT id
            FROM "ActivitySubmission"
            WHERE "participantId" = ${participantId}
              AND "activityId" = ${input.activityId}
              AND status = ${"PENDING"}::"SubmissionStatus"
            LIMIT 1
        `)[0];

        let submission;
        if (existingPending) {
            submission = (await tx.$queryRaw`
                UPDATE "ActivitySubmission"
                SET
                    "submissionLink" = ${input.submissionLink},
                    "submittedAt" = NOW(),
                    "reviewedAt" = NULL,
                    "reviewedByStaffProfileId" = NULL,
                    "reviewNote" = NULL
                WHERE id = ${existingPending.id}
                RETURNING *
            `)[0];
        } else {
            submission = (await tx.$queryRaw`
                INSERT INTO "ActivitySubmission"
                    (id, "participantId", "activityId", "submissionLink", status)
                VALUES
                    (${randomUUID()}, ${participantId}, ${input.activityId}, ${input.submissionLink}, ${"PENDING"}::"SubmissionStatus")
                RETURNING *
            `)[0];
        }

        return submission;
    });
}

async function getMySubmissions(participantId) {
    const rows = await prisma.$queryRaw`
        SELECT
            s.id,
            s."activityId",
            a.name AS "activityName",
            s."submissionLink",
            s.status,
            s."submittedAt",
            s."reviewedAt",
            s."reviewNote"
        FROM "ActivitySubmission" s
        INNER JOIN "Activity" a ON a.id = s."activityId"
        WHERE s."participantId" = ${participantId}
        ORDER BY s."submittedAt" DESC
    `;

    return rows;
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

async function listActivities(includeInactive) {
    const data = includeInactive
        ? await prisma.$queryRaw`
            SELECT
                a.id,
                a.code,
                a.name,
                a.description,
                a.points,
                a."isActive",
                a."createdAt",
                a."updatedAt",
                a."activityTypeId",
                at.code AS "activityTypeCode",
                at.name AS "activityTypeName"
            FROM "Activity" a
            INNER JOIN "ActivityType" at ON at.id = a."activityTypeId"
            ORDER BY a."isActive" DESC, a.name ASC
        `
        : await prisma.$queryRaw`
            SELECT
                a.id,
                a.code,
                a.name,
                a.description,
                a.points,
                a."isActive",
                a."createdAt",
                a."updatedAt",
                a."activityTypeId",
                at.code AS "activityTypeCode",
                at.name AS "activityTypeName"
            FROM "Activity" a
            INNER JOIN "ActivityType" at ON at.id = a."activityTypeId"
            WHERE a."isActive" = true
            ORDER BY a.name ASC
        `;

    return data;
}

async function listActivityKinds() {
    return prisma.$queryRaw`
        SELECT id, code, name, description, "isActive", "createdAt", "updatedAt"
        FROM "ActivityType"
        WHERE "isActive" = true
        ORDER BY name ASC
    `;
}

async function getActivityById(activityId) {
    const data = await prisma.$queryRaw`
        SELECT
            a.id,
            a.code,
            a.name,
            a.description,
            a.points,
            a."isActive",
            a."createdAt",
            a."updatedAt",
            a."activityTypeId",
            at.code AS "activityTypeCode",
            at.name AS "activityTypeName"
        FROM "Activity" a
        INNER JOIN "ActivityType" at ON at.id = a."activityTypeId"
        WHERE a.id = ${activityId}
        LIMIT 1
    `;

    return data[0] || null;
}

async function createActivity(payload, actorStaffProfileId) {
    const existing = await prisma.$queryRaw`
        SELECT id
        FROM "Activity"
        WHERE code = ${payload.code}
        LIMIT 1
    `;

    if (existing[0]) {
        throw new HttpError(409, "Activity code already exists");
    }

    const activityType = (await prisma.$queryRaw`
        SELECT id, code
        FROM "ActivityType"
        WHERE id = ${payload.activityTypeId}
        LIMIT 1
    `)[0];

    if (!activityType) {
        throw new HttpError(404, "Activity type not found");
    }

    const id = randomUUID();
    const row = (await prisma.$queryRaw`
        INSERT INTO "Activity"
            (id, code, name, description, points, "activityTypeId", "isActive", "createdByStaffProfileId", "updatedByStaffProfileId", "updatedAt")
        VALUES
            (
                ${id},
                ${payload.code},
                ${payload.name},
                ${payload.description || null},
                ${payload.points},
                ${payload.activityTypeId},
                ${payload.isActive},
                ${actorStaffProfileId},
                ${actorStaffProfileId},
                NOW()
            )
        RETURNING id, code, name, description, points, "activityTypeId", "isActive", "createdAt", "updatedAt"
    `)[0];

    await createAuditLog({
        actorStaffProfileId,
        actionType: "ACTIVITY_TYPE_CREATED",
        targetType: "Activity",
        targetId: row.id,
        note: null,
        payload: {
            ...row,
            activityTypeCode: activityType.code,
        },
    });

    return getActivityById(row.id);
}

async function updateActivity(activityId, payload, actorStaffProfileId) {
    const current = await getActivityById(activityId);

    if (!current) {
        throw new HttpError(404, "Activity not found");
    }

    const next = {
        code: payload.code ?? current.code,
        name: payload.name ?? current.name,
        description: payload.description === undefined ? current.description : payload.description,
        points: payload.points ?? current.points,
        activityTypeId: payload.activityTypeId ?? current.activityTypeId,
    };

    if (next.code !== current.code) {
        const existing = await prisma.$queryRaw`
            SELECT id
            FROM "Activity"
            WHERE code = ${next.code}
              AND id <> ${activityId}
            LIMIT 1
        `;

        if (existing[0]) {
            throw new HttpError(409, "Activity code already exists");
        }
    }

    if (next.activityTypeId !== current.activityTypeId) {
        const activityType = (await prisma.$queryRaw`
            SELECT id
            FROM "ActivityType"
            WHERE id = ${next.activityTypeId}
            LIMIT 1
        `)[0];

        if (!activityType) {
            throw new HttpError(404, "Activity type not found");
        }
    }

    await prisma.$queryRaw`
        UPDATE "Activity"
        SET
            code = ${next.code},
            name = ${next.name},
            description = ${next.description || null},
            points = ${next.points},
            "activityTypeId" = ${next.activityTypeId},
            "updatedByStaffProfileId" = ${actorStaffProfileId},
            "updatedAt" = NOW()
        WHERE id = ${activityId}
    `;

    const updated = await getActivityById(activityId);

    await createAuditLog({
        actorStaffProfileId,
        actionType: "ACTIVITY_TYPE_UPDATED",
        targetType: "Activity",
        targetId: activityId,
        note: null,
        payload: {
            before: current,
            after: updated,
        },
    });

    return updated;
}

async function toggleActivity(activityId, isActive, actorStaffProfileId) {
    const current = await getActivityById(activityId);

    if (!current) {
        throw new HttpError(404, "Activity not found");
    }

    await prisma.$queryRaw`
        UPDATE "Activity"
        SET
            "isActive" = ${isActive},
            "updatedByStaffProfileId" = ${actorStaffProfileId},
            "updatedAt" = NOW()
        WHERE id = ${activityId}
    `;

    const updated = await getActivityById(activityId);

    await createAuditLog({
        actorStaffProfileId,
        actionType: "ACTIVITY_TYPE_TOGGLED",
        targetType: "Activity",
        targetId: activityId,
        note: null,
        payload: {
            before: current.isActive,
            after: updated.isActive,
        },
    });

    return updated;
}

async function grantCompletion(tx, input, actorStaffProfileId) {
    const participant = (await tx.$queryRaw`
        SELECT id
        FROM "Participant"
        WHERE id = ${input.participantId}
        LIMIT 1
    `)[0];

    if (!participant) {
        throw new HttpError(404, "Participant not found");
    }

    const activity = (await tx.$queryRaw`
        SELECT a.id, a.code, a.name, a.points, a."isActive", at.code AS "activityTypeCode"
        FROM "Activity" a
        INNER JOIN "ActivityType" at ON at.id = a."activityTypeId"
        WHERE a.id = ${input.activityId}
        LIMIT 1
    `)[0];

    if (!activity) {
        throw new HttpError(404, "Activity not found");
    }

    if (!activity.isActive) {
        throw new HttpError(400, "Activity is inactive");
    }

    if (activity.activityTypeCode === "LINK_BASED" && !input.allowLinkBased) {
        throw new HttpError(400, "Link-based activities must be approved from submissions");
    }

    const existingCompletion = (await tx.$queryRaw`
        SELECT id
        FROM "ParticipantActivityCompletion"
        WHERE "participantId" = ${input.participantId}
          AND "activityId" = ${input.activityId}
        LIMIT 1
    `)[0];

    if (existingCompletion) {
        throw new HttpError(409, "Activity already marked for participant");
    }

    const completionId = randomUUID();

    const completion = (await tx.$queryRaw`
        INSERT INTO "ParticipantActivityCompletion"
            (id, "participantId", "activityId", "markedByStaffProfileId", note, "submissionLink")
        VALUES
            (
                ${completionId},
                ${input.participantId},
                ${input.activityId},
                ${actorStaffProfileId},
                ${input.note || null},
                ${input.submissionLink || null}
            )
        RETURNING id, "participantId", "activityId", "completedAt", note, "submissionLink"
    `)[0];

    await tx.$queryRaw`
        INSERT INTO "PointsLedger"
            (id, "participantId", "entryType", "pointsDelta", "sourceCompletionId", "actorStaffProfileId", metadata)
        VALUES
            (
                ${randomUUID()},
                ${input.participantId},
                ${"MANUAL_ACTIVITY"}::"PointsLedgerEntryType",
                ${activity.points},
                ${completionId},
                ${actorStaffProfileId},
                ${JSON.stringify({
        activityCode: activity.code,
        activityName: activity.name,
        activityTypeCode: activity.activityTypeCode,
    })}::jsonb
            )
    `;

    const summary = (await tx.$queryRaw`
        INSERT INTO "PointsSummary" ("participantId", "totalPoints", "updatedAt")
        VALUES (${input.participantId}, ${activity.points}, NOW())
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
        activityId: input.activityId,
        points: activity.points,
        source: input.source || "MANUAL",
    })}::jsonb
            )
    `;

    return { completion, summary, activity };
}

async function markActivityCompletion(input, actorStaffProfileId) {
    return prisma.$transaction((tx) =>
        grantCompletion(
            tx,
            {
                participantId: input.participantId,
                activityId: input.activityId,
                note: input.note,
                source: "MANUAL",
                allowLinkBased: false,
            },
            actorStaffProfileId
        )
    );
}

async function markActivityCompletionBatch(input, actorStaffProfileId) {
    const results = [];

    for (const participantId of input.participantIds) {
        try {
            const result = await markActivityCompletion(
                {
                    participantId,
                    activityId: input.activityId,
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

async function reviewSubmission(submissionId, decision, actorStaffProfileId, note) {
    return prisma.$transaction(async (tx) => {
        const submission = (await tx.$queryRaw`
            SELECT
                s.id,
                s."participantId",
                s."activityId",
                s."submissionLink",
                s.status,
                a.name AS "activityName",
                a.points
            FROM "ActivitySubmission" s
            INNER JOIN "Activity" a ON a.id = s."activityId"
            WHERE s.id = ${submissionId}
            LIMIT 1
        `)[0];

        if (!submission) {
            throw new HttpError(404, "Submission not found");
        }

        if (submission.status !== "PENDING") {
            throw new HttpError(409, "Submission already reviewed");
        }

        if (decision === "APPROVED") {
            const completionResult = await grantCompletion(
                tx,
                {
                    participantId: submission.participantId,
                    activityId: submission.activityId,
                    note,
                    source: "LINK_APPROVAL",
                    allowLinkBased: true,
                    submissionLink: submission.submissionLink,
                },
                actorStaffProfileId
            );

            await tx.$queryRaw`
                UPDATE "ActivitySubmission"
                SET
                    status = ${"APPROVED"}::"SubmissionStatus",
                    "reviewedAt" = NOW(),
                    "reviewedByStaffProfileId" = ${actorStaffProfileId},
                    "reviewNote" = ${note || null}
                WHERE id = ${submissionId}
            `;

            await tx.$queryRaw`
                INSERT INTO "PointsAuditLog"
                    (id, "actorStaffProfileId", "actionType", "targetType", "targetId", note, payload)
                VALUES
                    (
                        ${randomUUID()},
                        ${actorStaffProfileId},
                        ${"ACTIVITY_SUBMISSION_APPROVED"}::"PointsAuditActionType",
                        ${"ActivitySubmission"},
                        ${submissionId},
                        ${note || null},
                        ${JSON.stringify({
                participantId: submission.participantId,
                activityId: submission.activityId,
                points: submission.points,
            })}::jsonb
                    )
            `;

            return { submissionId, decision, completion: completionResult.completion, summary: completionResult.summary };
        }

        await tx.$queryRaw`
            UPDATE "ActivitySubmission"
            SET
                status = ${"REJECTED"}::"SubmissionStatus",
                "reviewedAt" = NOW(),
                "reviewedByStaffProfileId" = ${actorStaffProfileId},
                "reviewNote" = ${note || null}
            WHERE id = ${submissionId}
        `;

        await tx.$queryRaw`
            INSERT INTO "PointsAuditLog"
                (id, "actorStaffProfileId", "actionType", "targetType", "targetId", note, payload)
            VALUES
                (
                    ${randomUUID()},
                    ${actorStaffProfileId},
                    ${"ACTIVITY_SUBMISSION_REJECTED"}::"PointsAuditActionType",
                    ${"ActivitySubmission"},
                    ${submissionId},
                    ${note || null},
                    ${JSON.stringify({
            participantId: submission.participantId,
            activityId: submission.activityId,
        })}::jsonb
                )
        `;

        return { submissionId, decision };
    });
}

async function listPendingSubmissions(filters) {
    const limit = Number.isFinite(Number(filters.limit)) ? Math.trunc(Number(filters.limit)) : 20;
    const offset = Number.isFinite(Number(filters.offset)) ? Math.trunc(Number(filters.offset)) : 0;
    const safeLimit = Math.max(1, Math.min(100, limit));
    const safeOffset = Math.max(0, offset);

    const conditions = [`s.status = 'PENDING'::"SubmissionStatus"`];
    const values = [];

    if (filters.participantId) {
        values.push(filters.participantId);
        conditions.push(`s."participantId" = $${values.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const query = `
        SELECT
            s.id,
            s."participantId",
            p."fullName",
            p.institution,
            p.email,
            p.phone,
            s."activityId",
            a.name AS "activityName",
            a.points,
            s."submissionLink",
            s.status,
            s."submittedAt"
        FROM "ActivitySubmission" s
        INNER JOIN "Participant" p ON p.id = s."participantId"
        INNER JOIN "Activity" a ON a.id = s."activityId"
        ${whereClause}
        ORDER BY s."submittedAt" DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `;

    return prisma.$queryRawUnsafe(query, ...values);
}

async function getParticipantAdminDetails(participantId) {
    const participant = (await prisma.$queryRaw`
        SELECT id AS "participantId", "fullName", institution, email, phone
        FROM "Participant"
        WHERE id = ${participantId}
        LIMIT 1
    `)[0];

    if (!participant) {
        throw new HttpError(404, "Participant not found");
    }

    const summary = await getMyPointsSummary(participantId);

    const completions = await prisma.$queryRaw`
        SELECT
            pac.id,
            pac."activityId",
            a.name AS "activityName",
            a.code AS "activityCode",
            a.points,
            pac."completedAt",
            pac.note,
            pac."submissionLink"
        FROM "ParticipantActivityCompletion" pac
        INNER JOIN "Activity" a ON a.id = pac."activityId"
        WHERE pac."participantId" = ${participantId}
        ORDER BY pac."completedAt" DESC
    `;

    const pendingSubmissions = await prisma.$queryRaw`
        SELECT
            s.id,
            s."activityId",
            a.name AS "activityName",
            a.points,
            s."submissionLink",
            s.status,
            s."submittedAt",
            s."reviewedAt",
            s."reviewNote"
        FROM "ActivitySubmission" s
        INNER JOIN "Activity" a ON a.id = s."activityId"
        WHERE s."participantId" = ${participantId}
          AND s.status = ${"PENDING"}::"SubmissionStatus"
        ORDER BY s."submittedAt" DESC
    `;

    const ledger = await prisma.$queryRaw`
        SELECT
            id,
            "entryType",
            "pointsDelta",
            metadata,
            "createdAt"
        FROM "PointsLedger"
        WHERE "participantId" = ${participantId}
        ORDER BY "createdAt" DESC
        LIMIT 20
    `;

    return {
        participant,
        summary,
        completions,
        pendingSubmissions,
        ledger,
    };
}

async function revokeActivityCompletion(completionId, note, actorStaffProfileId) {
    return prisma.$transaction(async (tx) => {
        const completion = (await tx.$queryRaw`
            SELECT
                pac.id,
                pac."participantId",
                pac."activityId",
                pac."completedAt",
                a.points
            FROM "ParticipantActivityCompletion" pac
            INNER JOIN "Activity" a ON a.id = pac."activityId"
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
            activityId: completion.activityId,
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
    submitMyActivityLink,
    getMySubmissions,
    getLeaderboard,
    listActivities,
    listActivityKinds,
    createActivity,
    updateActivity,
    toggleActivity,
    markActivityCompletion,
    markActivityCompletionBatch,
    reviewSubmission,
    listPendingSubmissions,
    getParticipantAdminDetails,
    revokeActivityCompletion,
    adjustParticipantPoints,
    getAuditLogs,
};
