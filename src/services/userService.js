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
        SELECT id, "userId", cnic, email, "fullName", phone, institution, "rollNumber", "createdAt", "updatedAt"
        FROM "Participant"
        WHERE "userId" = ${userId}
        LIMIT 1
    `;

    return data[0] || null;
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
    findUserById,
    findParticipantByUserId,
    findStaffProfileByUserId,
    logUserAction,
};
