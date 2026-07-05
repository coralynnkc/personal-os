import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !svc) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// Server-only client (service role — bypasses RLS)
export const supabaseAdmin = createClient(url, svc);

export const USER_ID = process.env.USER_ID ?? "cora";
