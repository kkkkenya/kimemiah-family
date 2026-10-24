import { NextResponse } from "next/server";
import { sendTest } from "@/lib/server/push";
import { callerDevice } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Send me a test" in Settings: one notification to the phone that asked.
export async function POST(req: Request) {
  const device = await callerDevice(req);
  if (!device?.member_id) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  try {
    return NextResponse.json(await sendTest(device.id, device.member_id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
