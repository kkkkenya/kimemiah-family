"use client";

import { LocalDB } from "./db";
import { createSyncEngine, type SyncEngine } from "./engine";
import { supabaseRemote } from "./remote";
import { resetSupabase } from "@/lib/supabase/client";

let db: LocalDB | null = null;
let engine: SyncEngine | null = null;

export function localDB(): LocalDB {
  if (!db) db = new LocalDB();
  return db;
}

export function syncEngine(): SyncEngine {
  if (!engine) engine = createSyncEngine(localDB(), supabaseRemote);
  return engine;
}

// Who this phone is. Kept locally so the app opens offline.
export type PhoneIdentity = { deviceId?: string; memberId?: string };

export async function readIdentity(): Promise<PhoneIdentity> {
  const meta = localDB().meta;
  const [deviceId, memberId] = await Promise.all([meta.get("deviceId"), meta.get("memberId")]);
  return { deviceId: deviceId?.value as string | undefined, memberId: memberId?.value as string | undefined };
}

const SIGNED_OUT_NOTE = "kimemiah-signed-out";

// Forget everything on this phone. `remote` means someone else signed it out,
// so the unlock screen explains why.
export async function wipePhone({ remote = false } = {}): Promise<void> {
  if (remote) sessionStorage.setItem(SIGNED_OUT_NOTE, "1");
  localStorage.removeItem("kimemiah-auth");
  resetSupabase();
  await localDB().delete();
  db = null;
  engine = null;
}

// Read once: true if this phone was just signed out from elsewhere.
export function takeSignedOutNote(): boolean {
  const note = sessionStorage.getItem(SIGNED_OUT_NOTE) === "1";
  sessionStorage.removeItem(SIGNED_OUT_NOTE);
  return note;
}
