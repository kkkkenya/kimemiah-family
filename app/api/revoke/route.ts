import { NextResponse } from "next/server";
import { adminClient, callerDevice } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signs out one phone, this phone, or every phone.
// body: { deviceId: string } | { self: true } | { all: true }
export async function POST(req: Request) {
  const caller = await callerDevice(req);
  if (!caller) {
    return NextResponse.json({ error: "not_unlocked", message: "This phone isn't signed in." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const now = new Date().toISOString();

  if (body?.all === true) {
    if (!caller.member_id) {
      return NextResponse.json({ error: "forbidden", message: "Pick who you are first." }, { status: 403 });
    }
    const { error } = await admin.from("devices").update({ revoked_at: now, updated_at: now }).is("revoked_at", null);
    if (error) return NextResponse.json({ error: "server", message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, signedOut: "all" });
  }

  const target = body?.self === true ? caller.id : typeof body?.deviceId === "string" ? body.deviceId : null;
  if (!target) {
    return NextResponse.json({ error: "bad_request", message: "Say which phone to sign out." }, { status: 400 });
  }
  if (target !== caller.id && !caller.member_id) {
    return NextResponse.json({ error: "forbidden", message: "Pick who you are first." }, { status: 403 });
  }
  const { error } = await admin
    .from("devices")
    .update({ revoked_at: now, updated_at: now })
    .eq("id", target)
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: "server", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, signedOut: target });
}
