import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client (service role — bypasses RLS). Created lazily so that
// merely importing this module (e.g. during Next.js build-time page-data
// collection) doesn't require the env vars — only actually using the client
// at request time does, keeping the fail-closed check without breaking builds.
let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svc) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  client = createClient(url, svc);
  return client;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export const USER_ID = process.env.USER_ID ?? "cora";
