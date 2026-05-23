import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "senaq-wa-agent" } },
  },
);
