"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { localDB } from "@/lib/sync/client";
import { setMeta } from "@/lib/sync/db";

function UnlockForm() {
  const router = useRouter();
  const signedOut = useSearchParams().get("signedOut") === "1";
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError("Unlocking needs signal the first time. Connect and try again.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? "That didn't work. Try again.");
        setPin("");
        return;
      }
      const { error: sessionError } = await supabase().auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (sessionError) return setError("Couldn't sign this phone in. Try again.");
      await setMeta(localDB(), "deviceId", body.deviceId);
      router.replace("/who");
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
      {signedOut && (
        <p className="rounded-xl bg-low-bg px-3 py-2 text-low-fg">This phone was signed out. Enter the family PIN to unlock it again.</p>
      )}
      <label htmlFor="pin" className="font-bold">
        Family PIN
      </label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        minLength={6}
        maxLength={12}
        required
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        className="min-h-14 rounded-xl border border-line bg-raised px-4 text-center text-2xl tracking-[0.4em] tabular"
      />
      {error && (
        <p role="alert" className="text-out-strong">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || pin.length < 6}
        className="min-h-14 rounded-xl bg-brand text-lg font-bold text-brand-contrast disabled:opacity-50"
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
      <p className="text-sm text-muted">Ask the family for the PIN. You only enter it once on this phone.</p>
    </form>
  );
}

export default function UnlockPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="kanga h-1 w-24" />
      <h1 className="font-display text-3xl">Kimemiah Home</h1>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </main>
  );
}
