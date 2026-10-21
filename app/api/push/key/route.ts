import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The public half of the push key pair, so a phone can subscribe. Not a secret.
export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  return key ? NextResponse.json({ key }) : NextResponse.json({ error: "push not set up" }, { status: 503 });
}
