"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ProfileCard } from "@/components/ProfileCard";
import { PushCard } from "@/components/PushCard";
import { ThemeCard } from "@/components/ThemeToggle";
import { HouseSettingsCard, MyJobSettings } from "@/components/SettingsCards";
import { Card, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { supabase } from "@/lib/supabase/client";
import { localDB, syncEngine, wipePhone } from "@/lib/sync/client";
import { useMe, useMeta, useRows, type Member } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";

type Device = Row & { label: string | null; member_id: string | null; last_seen_at: string; revoked_at: string | null };

const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-KE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Nairobi",
      })
    : "never";

async function revoke(body: object): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/revoke", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return "Signing out a phone needs signal.";
  if (!res.ok) return ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "That didn't work.";
  return null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { online, syncing, syncNow } = useSync();
  const me = useMe();
  const myDevice = useMeta<string>("deviceId");
  const lastSynced = useMeta<string>("lastSyncedAt");
  const lastError = useMeta<string>("lastError");
  const members = useRows<Member>("members");
  const devices = useRows<Device>("devices");
  const rejected = useLiveQuery(() => localDB().outbox.where("status").equals("rejected").toArray(), [], []);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const nameOf = (id: string | null) => members?.find((m) => m.id === id)?.name ?? "Not picked yet";
  const activeDevices = (devices ?? []).filter((d) => !d.revoked_at);

  async function signOut(body: object, afterwards?: () => Promise<void>) {
    setMessage(null);
    const error = await revoke(body);
    if (error) return setMessage(error);
    if (afterwards) await afterwards();
    else await syncNow();
  }

  const leaveThisPhone = async () => {
    await wipePhone();
    router.replace("/unlock");
  };

  return (
    <Screen title="Settings" back="/">
      <ProfileCard />
      <PushCard />
      <ThemeCard />
      <MyJobSettings />
      <HouseSettingsCard />
      <Card>
        <h2 className="font-bold">Get the app</h2>
        <p className="mt-1 text-sm">
          <strong>Android:</strong> download the app, open the file, and allow installing from your browser if the phone asks. It opens this same app, without the address bar.
        </p>
        <a href="/kimemiah.apk" download className="mt-2 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
          Download for Android
        </a>
        <p className="mt-3 text-sm">
          <strong>iPhone:</strong> open this page in Safari, tap Share, then <em>Add to Home Screen</em>.
        </p>
      </Card>

      <Card>
        <h2 className="font-bold">This phone</h2>
        <p className="text-muted">Used by {me?.name ?? "…"}</p>
        <button
          type="button"
          disabled={!online}
          onClick={() => router.push("/who")}
          className="mt-3 min-h-12 rounded-xl border border-line px-4 font-bold text-brand disabled:opacity-50"
        >
          Switch person
        </button>
        {!online && <p className="mt-2 text-sm text-muted">Switching person needs signal.</p>}
      </Card>

      <Card>
        <h2 className="font-bold">Sync</h2>
        <p className="text-muted">Last synced: {when(lastSynced)}</p>
        {lastError && <p className="text-sm text-out-strong">Last try failed: {lastError}</p>}
        <button
          type="button"
          disabled={!online || syncing}
          onClick={() => syncNow()}
          className="mt-3 min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {rejected.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {rejected.map((r) => (
              <li key={r.seq} className="flex items-start justify-between gap-3 border-l-4 border-low-fg bg-low-bg px-3 py-2">
                <span className="text-sm text-low-fg">
                  Your change wasn&apos;t saved: {r.reason}
                </span>
                <button type="button" className="min-h-12 px-2 text-sm font-bold" onClick={() => syncEngine().dismissRejected(r.seq!)}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-bold">Signed-in phones</h2>
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {activeDevices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <span>
                <span className="block font-bold">
                  {nameOf(d.member_id)} {d.id === myDevice && <span className="font-normal text-muted">(this phone)</span>}
                </span>
                <span className="block text-sm text-muted">
                  {d.label ?? "Phone"} · last seen {when(d.last_seen_at)}
                </span>
              </span>
              {d.id !== myDevice && (
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => signOut({ deviceId: d.id })}
                  className="min-h-12 rounded-xl px-3 text-sm font-bold text-out-strong disabled:opacity-50"
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!online}
            onClick={() => signOut({ self: true }, leaveThisPhone)}
            className="min-h-12 rounded-xl border border-line px-4 font-bold disabled:opacity-50"
          >
            Sign out this phone
          </button>
          {confirmAll ? (
            <button
              type="button"
              disabled={!online}
              onClick={() => signOut({ all: true }, leaveThisPhone)}
              className="min-h-12 rounded-xl bg-out-bg px-4 font-bold text-out-fg disabled:opacity-50"
            >
              Yes, sign out every phone
            </button>
          ) : (
            <button
              type="button"
              disabled={!online}
              onClick={() => setConfirmAll(true)}
              className="min-h-12 rounded-xl border border-out-strong px-4 font-bold text-out-strong disabled:opacity-50"
            >
              Sign out every phone
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-muted">
          After changing the family PIN, sign out every phone. Everyone unlocks again with the new PIN.
        </p>
        {message && <p className="mt-2 text-sm text-out-strong">{message}</p>}
      </Card>
    </Screen>
  );
}
