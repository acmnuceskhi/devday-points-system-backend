const { randomUUID } = require("node:crypto");
const { prisma } = require("../db/prisma");

async function findUserByEmail(email) {
    const data = await prisma.$queryRaw`
        SELECT id, email, password, "isActive", type
        FROM "User"
        WHERE email = ${email}
        LIMIT 1
    `;

    console.log(`User lookup for email: ${email} - Found: ${!!data[0]}`);

    return data[0] || null;
}

async function findUserById(userId) {
    const data = await prisma.$queryRaw`
        SELECT id, email, password, "isActive", type
        FROM "User"
        WHERE id = ${userId}
        LIMIT 1
    `;

    return data[0] || null;
}

async function findParticipantByUserId(userId) {
    const data = await prisma.$queryRaw`
        SELECT id, "userId", cnic, email, "fullName", phone, institution, "rollNumber", "minigameCode", "createdAt", "updatedAt"
        FROM "Participant"
        WHERE "userId" = ${userId}
        LIMIT 1
    `;

    return data[0] || null;
}

async function findParticipantByEmail(email) {
    const data = await prisma.$queryRaw`
        SELECT id, "userId", cnic, email, "fullName", phone, institution, "rollNumber", "minigameCode", "createdAt", "updatedAt"
        FROM "Participant"
        WHERE lower(email) = lower(${email})
        LIMIT 1
    `;

    return data[0] || null;
}

async function findParticipantAccountByEmail(email) {
    const data = await prisma.$queryRaw`
        SELECT
            p.id AS "participantId",
            p.email AS "participantEmail",
            u.id AS "userId",
            u.password,
            u."isActive",
            u.type
        FROM "Participant" p
        LEFT JOIN "User" u ON u.id = p."userId"
        WHERE lower(p.email) = lower(${email})
        LIMIT 1
    `;

    return data[0] || null;
}

async function findUserByEmailInsensitive(email) {
    const data = await prisma.$queryRaw`
        SELECT id, email, password, "isActive", type
        FROM "User"
        WHERE lower(email) = lower(${email})
        LIMIT 1
    `;

    return data[0] || null;
}

async function updateUserPassword(userId, passwordHash) {
    const rows = await prisma.$queryRaw`
        UPDATE "User"
        SET
            password = ${passwordHash},
            "isActive" = true,
            "updatedAt" = NOW()
        WHERE id = ${userId}
        RETURNING id, email, "isActive", type
    `;

    return rows[0] || null;
}

async function findStaffProfileByUserId(userId) {
    const data = await prisma.$queryRaw`
        SELECT id, "fullName", "nuId", "isApproved", "staffRole", "assignedBooth"
        FROM "StaffProfile"
        WHERE id = ${userId}
        LIMIT 1
    `;

    return data[0] || null;
}

async function logUserAction(userId, action) {
    try {
        await prisma.$executeRaw`
            INSERT INTO "UserAction" (id, "userId", action)
            VALUES (${randomUUID()}, ${userId}, ${action}::"UserActionType")
        `;
    } catch (error) {
        // Keep auth flow resilient if action enum is different in target DB.
        console.warn("UserAction log failed:", error.message);
    }
}

module.exports = {
    findUserByEmail,
    findUserByEmailInsensitive,
    findUserById,
    findParticipantByUserId,
    findParticipantByEmail,
    findParticipantAccountByEmail,
    updateUserPassword,
    findStaffProfileByUserId,
    logUserAction,
};
