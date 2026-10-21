import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

// Full-access client. Server only; never sent to phones.
export function adminClient(): SupabaseClient {
  return createClient(serverEnv.supabaseUrl(), serverEnv.serviceKey(), noSession);
}

// Plain client, used to sign a new phone in and to check a phone's token.
export function anonClient(): SupabaseClient {
  return createClient(serverEnv.supabaseUrl(), serverEnv.anonKey(), noSession);
}

// The phone behind a request, if it is unlocked and not revoked.
export async function callerDevice(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: device } = await admin
    .from("devices")
    .select("id, member_id, revoked_at")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!device || device.revoked_at) return null;
  return device as { id: string; member_id: string | null; revoked_at: null };
}
