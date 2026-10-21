"use client";

import { LocalDB } from "./db";
import { createSyncEngine, type SyncEngine } from "./engine";
import { supabaseRemote } from "./remote";

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

// Forget everything on this phone (after being signed out).
export async function wipePhone(): Promise<void> {
  localStorage.removeItem("kimemiah-auth");
  await localDB().delete();
  db = null;
  engine = null;
}
