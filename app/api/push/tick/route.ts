import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runTick } from "@/lib/server/push";
import { callerDevice } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(given: string | null): boolean {
  const want = process.env.NOTIFY_SHARED_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called every 5 minutes by the database scheduler (with the shared secret), and right away
// by an unlocked phone after it posts an urgent job or hands one over.
export async function POST(req: Request) {
  const allowed = secretMatches(req.headers.get("x-notify-secret")) || Boolean((await callerDevice(req))?.member_id);
  if (!allowed) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  try {
    return NextResponse.json(await runTick());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
