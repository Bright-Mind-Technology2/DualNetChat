import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function validateSupabaseConnection() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      enabled: false,
      message: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.",
    };
  }

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY },
    });

    if (!response.ok) {
      return {
        enabled: false,
        message: `Supabase health check failed with HTTP ${response.status}.`,
      };
    }

    return {
      enabled: true,
      message: "Supabase API is reachable. Chat data is still stored in local SQLite.",
    };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return {
      enabled: false,
      message: error.message,
    };
  }
}
