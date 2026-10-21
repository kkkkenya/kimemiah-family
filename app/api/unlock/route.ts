import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/server/env";
import { clientIp, deviceLabel, hashIp, LIMITS } from "@/lib/server/pin";
import { adminClient, anonClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// Checks the family PIN and, if right, creates a sign-in for this phone.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (!/^\d{6,12}$/.test(pin)) {
    return NextResponse.json({ error: "bad_request", message: "The PIN is 6 or more digits." }, { status: 400 });
  }

  const admin = adminClient();
  const pinHash = serverEnv.pinHash();
  const ipHash = hashIp(clientIp(req), pinHash);

  const [{ count: globalFails }, { count: ipFails }] = await Promise.all([
    admin.from("auth_failures").select("id", { count: "exact", head: true }).gte("at", minutesAgo(LIMITS.globalWindowMin)),
    admin
      .from("auth_failures")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("at", minutesAgo(LIMITS.perIpWindowMin)),
  ]);

  if ((globalFails ?? 0) >= LIMITS.global) {
    return NextResponse.json(
      { error: "locked", message: "Too many wrong PINs. Unlocking is paused for an hour." },
      { status: 423 },
    );
  }
  if ((ipFails ?? 0) >= LIMITS.perIp) {
    return NextResponse.json(
      { error: "too_many", message: `Too many wrong tries. Wait ${LIMITS.perIpWindowMin} minutes and try again.` },
      { status: 429 },
    );
  }

  if (!(await bcrypt.compare(pin, pinHash))) {
    await admin.from("auth_failures").insert({ ip_hash: ipHash });
    if ((globalFails ?? 0) + 1 >= LIMITS.global) {
      // Push alert to the owner arrives in Phase 7; for now it shows in the activity feed.
      await admin.from("activity").insert({
        kind: "security_alert",
        summary: "Unlocking paused for an hour after many wrong PINs.",
      });
    }
    const remaining = Math.max(0, LIMITS.perIp - (ipFails ?? 0) - 1);
    return NextResponse.json(
      {
        error: "wrong_pin",
        message:
          remaining > 1
            ? `Wrong PIN. ${remaining} tries left.`
            : remaining === 1
              ? "Wrong PIN. 1 try left."
              : "Wrong PIN. Wait 15 minutes and try again.",
      },
      { status: 401 },
    );
  }

  // Each phone gets its own sign-in. The password is random and thrown away;
  // the phone keeps its session and refreshes it.
  const email = `device-${randomUUID()}@devices.kimemiah.invalid`;
  const password = randomBytes(32).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { kind: "device" },
  });
  if (created.error || !created.data.user) {
    return NextResponse.json({ error: "server", message: "Couldn't set up this phone. Try again." }, { status: 500 });
  }

  const { error: deviceError } = await admin
    .from("devices")
    .insert({ id: created.data.user.id, label: deviceLabel(req.headers.get("user-agent")) });
  if (deviceError) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return NextResponse.json({ error: "server", message: "Couldn't set up this phone. Try again." }, { status: 500 });
  }

  const signIn = await anonClient().auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    return NextResponse.json({ error: "server", message: "Couldn't sign this phone in. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    deviceId: created.data.user.id,
    access_token: signIn.data.session.access_token,
    refresh_token: signIn.data.session.refresh_token,
  });
}
