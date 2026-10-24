"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { NOTICE, type NoticeType } from "@/lib/push/style";
import { pushState, resetPush, sendTest, turnOff, turnOn, type PushState, type Step } from "@/lib/push/client";
import { syncEngine } from "@/lib/sync/client";
import { useMe } from "@/lib/sync/hooks";

const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = () => typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
// What the button says while it works, so a slow phone doesn't look frozen.
const STEP: Record<Step, string> = {
  asking: "Waiting for you to tap Allow…",
  starting: "Starting up…",
  connecting: "Connecting this phone…",
  saving: "Saving…",
};
const SHOWN: NoticeType[] = ["urgent", "due", "swap", "suggest", "money", "bill", "question", "shop", "team", "thanks"];

/**
 * Setting up notifications on this phone, as three clear steps: get the app, allow
 * notifications, send a test. Then what you'll get, and whether money amounts show on the lock
 * screen. `compact` (on Home) is just a nudge to set it up, gone once it's on.
 */
export function PushCard({ compact = false }: { compact?: boolean }) {
  const { syncNow } = useSync();
  const me = useMe() as (ReturnType<typeof useMe> & { alert_amounts?: boolean }) | undefined;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  if (!state) return null;

  if (compact) {
    if (state === "on" || state === "unsupported") return null;
    return (
      <Link href="/more/settings#alerts" className="flex items-center gap-3 rounded-2xl border border-line bg-raised p-4">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-[#E8590C] text-lg text-white">
          🔔
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Turn on notifications</span>
          <span className="text-sm text-muted">Know when water is back, when a job is yours, when someone&apos;s at the shop. Takes a minute.</span>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    );
  }

  const appReady = state !== "needs_install" && state !== "unsupported";
  const allowed = state === "on";

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const err = await turnOn(setStep);
      setNote(err ?? "Notifications are on. Send yourself a test to check.");
    } catch {
      setNote("Something went wrong. Tap Reset below, then Turn on again.");
    } finally {
      setStep(null);
      setBusy(false);
      setState(await pushState());
    }
  }

  return (
    <section id="alerts" aria-labelledby="alerts-h" className="rounded-2xl border border-line bg-raised p-5">
      <h2 id="alerts-h" className="font-display text-xl">
        Notifications
      </h2>
      <p className="text-sm text-muted">{allowed ? "On for this phone. Quiet from 21:00 to 07:00." : "Three steps. Each phone is set up on its own."}</p>

      <ol className="mt-3 flex flex-col gap-3">
        <Step n={1} done={appReady} title="Get the app on this phone">
          {state === "needs_install" ? (
            <p>
              iPhone: open this page in <strong>Safari</strong>, tap <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>. Open Kimemiah from the Home Screen and come back here.
            </p>
          ) : state === "unsupported" ? (
            <p>This browser can&apos;t show notifications. On Android use Chrome or the Kimemiah app (Settings → Get the app); on iPhone add it to the Home Screen.</p>
          ) : (
            <p>Done. {isAndroid() ? "The Kimemiah app or Chrome both work." : "You're in the app."}</p>
          )}
        </Step>

        <Step n={2} done={allowed} title="Allow notifications">
          {state === "blocked" ? (
            <div className="flex flex-col gap-1">
              <p>This phone said no earlier, so the app can&apos;t ask again. Turn them on here:</p>
              {isIos() ? (
                <p>
                  <strong>Settings → Notifications → Kimemiah → Allow Notifications</strong>, then reopen the app.
                </p>
              ) : (
                <p>
                  Press and hold the Kimemiah icon → <strong>App info → Notifications → Allow</strong>. In Chrome: tap <strong>⋮ → Settings → Site settings → Notifications</strong> and allow this site.
                </p>
              )}
              <button type="button" onClick={() => void pushState().then(setState)} className="mt-1 min-h-10 self-start rounded-xl border border-line px-4 text-sm font-bold">
                I&apos;ve allowed it, check again
              </button>
            </div>
          ) : allowed ? (
            <p>Allowed.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p>Your phone will ask once. Tap <strong>Allow</strong>.</p>
              <button type="button" disabled={busy || !appReady} onClick={enable} className="min-h-12 self-start rounded-xl bg-brand px-5 font-bold text-brand-contrast disabled:opacity-50">
                {busy ? STEP[step ?? "asking"] : "Turn on notifications"}
              </button>
            </div>
          )}
        </Step>

        <Step n={3} done={false} title="Send yourself a test">
          <div className="flex flex-col gap-2">
            <p>A test arrives in a few seconds. If it doesn&apos;t, check the phone isn&apos;t on Do Not Disturb.</p>
            <button
              type="button"
              disabled={!appReady || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setNote(await sendTest());
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-12 self-start rounded-xl border border-ink px-5 font-bold disabled:opacity-50"
            >
              Send me a test
            </button>
          </div>
        </Step>
      </ol>
      {note && <p className="mt-2 text-sm">{note}</p>}

      <details className="mt-4 rounded-xl bg-base p-3">
        <summary className="min-h-10 cursor-pointer font-bold">What you&apos;ll get</summary>
        <ul className="mt-2 flex flex-col gap-2">
          {SHOWN.map((t) => (
            <li key={t} className="flex items-center gap-3 text-sm">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: NOTICE[t].color }}>
                {NOTICE[t].emoji}
              </span>
              <span>
                <strong>{NOTICE[t].label}</strong> · {NOTICE[t].hint}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Never between 21:00 and 07:00. Never about something you did yourself. Everything also lands in the bell at the top.</p>
      </details>

      {me && (
        <label className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
          <span>
            <span className="block">Show money amounts on the lock screen</span>
            <span className="text-xs text-muted">Off: “Food budget at 80%”. On: “KES 8,000 of KES 10,000”.</span>
          </span>
          <input
            type="checkbox"
            checked={!!me.alert_amounts}
            onChange={(e) => void syncEngine().queue("members", "update", { id: me.id, alert_amounts: e.target.checked }).then(() => syncNow())}
            className="size-5 shrink-0 accent-[var(--action)]"
          />
        </label>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5">
        {allowed && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setNote(await turnOff());
              } finally {
                setBusy(false);
                setState(await pushState());
              }
            }}
            className="min-h-10 text-sm font-bold text-muted underline underline-offset-4"
          >
            Turn notifications off on this phone
          </button>
        )}
        {appReady && (
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              await resetPush();
              window.location.reload();
            }}
            className="min-h-10 text-sm font-bold text-muted underline underline-offset-4"
          >
            Stuck? Reset notifications on this phone
          </button>
        )}
      </div>
    </section>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-ok-fg text-white" : "border-2 border-line"}`}>
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-[1rem] font-bold">
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </p>
        {children}
      </div>
    </li>
  );
}
