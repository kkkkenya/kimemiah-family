"use client";

import { useEffect, useState } from "react";
import { pushState, turnOff, turnOn, type PushState } from "@/lib/push/client";

const TEXT: Record<PushState, string> = {
  unsupported: "This browser can't show alerts. Open the app in Chrome (Android) or add it to the Home Screen (iPhone).",
  needs_install: "On iPhone, alerts work once the app is on your Home Screen: Share > Add to Home Screen, then open it from there.",
  blocked: "Alerts are blocked for this app. Allow notifications in the phone's settings, then come back.",
  off: "Get an alert when water is back, when your job is covered or overdue, and a reminder every 2 hours while a job is yours. Never between 21:00 and 07:00.",
  on: "Alerts are on for this phone. Quiet from 21:00 to 07:00.",
};

// Turn push alerts on or off for this phone. `compact` hides it once alerts are on (for Home).
export function PushCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  if (!state || (compact && (state === "on" || state === "unsupported"))) return null;

  async function toggle() {
    setBusy(true);
    setError(await (state === "on" ? turnOff() : turnOn()));
    setState(await pushState());
    setBusy(false);
  }

  return (
    <section aria-labelledby="alerts" className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      <h2 id="alerts" className="font-bold">
        Alerts on this phone
      </h2>
      <p className="text-sm text-muted">{TEXT[state]}</p>
      {(state === "off" || state === "on") && (
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className={`mt-2 min-h-12 rounded-xl px-4 font-bold disabled:opacity-50 ${state === "on" ? "border border-line" : "bg-brand text-brand-contrast"}`}
        >
          {busy ? "One moment…" : state === "on" ? "Turn alerts off" : "Turn on alerts"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-low-fg">{error}</p>}
    </section>
  );
}
