import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client (anon key — respects RLS)
export const supabase = createClient(url, anon);

// Server-only client (service role — bypasses RLS)
export const supabaseAdmin = createClient(url, svc);

export const USER_ID = process.env.USER_ID ?? "cora";
