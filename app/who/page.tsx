"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarPicker } from "@/components/Avatar";
import { supabase } from "@/lib/supabase/client";
import { localDB, readIdentity, syncEngine } from "@/lib/sync/client";
import { setMeta } from "@/lib/sync/db";

type Person = { id: string; name: string; is_remote: boolean; avatar: string | null };

export default function WhoPage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Person | null>(null); // name picked: now their picture

  useEffect(() => {
    readIdentity().then(async ({ deviceId }) => {
      if (!deviceId) return router.replace("/unlock");
      const { data, error } = await supabase()
        .from("members")
        .select("id, name, is_remote, avatar")
        .eq("active", true)
        .is("deleted_at", null)
        .order("sort");
      if (error) setError("Couldn't load the family list. Check your connection.");
      else setPeople(data);
    });
  }, [router]);

  async function pick(person: Person) {
    setPicking(person.id);
    setError(null);
    const { error } = await supabase().rpc("set_device_member", { p_member: person.id });
    if (error) {
      setPicking(null);
      return setError(
        error.code === "42501" ? "This phone was signed out. Unlock it again." : "Couldn't save that. Check your connection.",
      );
    }
    await setMeta(localDB(), "memberId", person.id);
    await localDB().rows("members").put({ ...person, active: true, deleted_at: null });
    void syncEngine().syncNow(); // the rest arrives in the background
    setPicking(null);
    setChosen(person);
  }

  async function pickPicture(avatar: string) {
    if (!chosen) return;
    await syncEngine().queue("members", "update", { id: chosen.id, avatar });
    void syncEngine().syncNow();
    router.replace("/");
  }

  if (chosen) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
        <div className="kanga h-1 w-24" />
        <h1 className="font-display text-3xl text-balance">Hi {chosen.name}, pick your picture</h1>
        <p className="text-muted">It shows next to your name around the app. You can change it, and your name, in Settings.</p>
        <AvatarPicker value={chosen.avatar} onPick={pickPicture} />
        <button type="button" onClick={() => router.replace("/")} className="min-h-12 rounded-xl px-4 font-bold text-brand">
          {chosen.avatar ? "Keep my picture" : "Skip for now"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="kanga h-1 w-24" />
      <h1 className="font-display text-3xl text-balance">Who&apos;s using this phone?</h1>
      <p className="text-muted">Everything you do in the app is credited to this name. You can switch later in Settings.</p>
      {error && (
        <p role="alert" className="text-out-strong">
          {error}
        </p>
      )}
      {!people && !error && <p className="text-muted">Loading the family…</p>}
      <ul className="flex flex-col gap-3">
        {people?.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={picking !== null}
              onClick={() => pick(p)}
              className="flex min-h-14 w-full items-center justify-between rounded-xl bg-raised px-4 text-left text-lg font-bold border border-line disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <Avatar avatar={p.avatar} name={p.name} size={40} />
                {p.name}
              </span>
              <span className="text-sm font-normal text-muted">{picking === p.id ? "Saving…" : p.is_remote ? "Away from home" : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
