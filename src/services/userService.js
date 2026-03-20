const { randomUUID } = require("node:crypto");
const { supabase } = require("../db/supabase");

function throwDbError(context, error) {
    throw new Error(`${context}: ${error.message}`);
}

async function findUserByEmail(email) {
    const { data, error } = await supabase
        .from("User")
        .select("id, email, password, isActive, type")
        .eq("email", email)
        .limit(1);

    if (error) {
        throwDbError("Failed to fetch user by email", error);
    }

    console.log(`User lookup for email: ${email} - Found: ${!!data[0]}`);

    return data[0] || null;
}

async function findUserById(userId) {
    const { data, error } = await supabase
        .from("User")
        .select("id, email, password, isActive, type")
        .eq("id", userId)
        .limit(1);

    if (error) {
        throwDbError("Failed to fetch user by id", error);
    }

    return data[0] || null;
}

async function findParticipantByUserId(userId) {
    const { data, error } = await supabase
        .from("Participant")
        .select("id, userId, cnic, email, fullName, phone, institution, rollNumber, createdAt, updatedAt")
        .eq("userId", userId)
        .limit(1);

    if (error) {
        throwDbError("Failed to fetch participant by user id", error);
    }

    return data[0] || null;
}

async function logUserAction(userId, action) {
    try {
        const { error } = await supabase.from("UserAction").insert({
            id: randomUUID(),
            userId,
            action,
        });

        if (error) {
            throw error;
        }
    } catch (error) {
        // Keep auth flow resilient if action enum is different in target DB.
        console.warn("UserAction log failed:", error.message);
    }
}

module.exports = {
    findUserByEmail,
    findUserById,
    findParticipantByUserId,
    logUserAction,
};
