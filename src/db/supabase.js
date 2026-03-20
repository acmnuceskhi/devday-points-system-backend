const { createClient } = require("@supabase/supabase-js");
const { env, validateEnv } = require("../config/env");

validateEnv();

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

module.exports = { supabase };
