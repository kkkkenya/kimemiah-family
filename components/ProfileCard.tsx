"use client";

import { useState } from "react";
import { Avatar, AvatarPicker } from "@/components/Avatar";
import { Card } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { shrinkPhoto } from "@/lib/images";
import { supabase } from "@/lib/supabase/client";
import { syncEngine } from "@/lib/sync/client";
import { useMe } from "@/lib/sync/hooks";

type Me = { id: string; name: string; avatar?: string | null; home_photo?: string | null };

// Your name, your picture, and the photo on your Home screen (none, the family photo, or your own).
export function ProfileCard() {
  const { online, syncNow } = useSync();
  const me = useMe() as Me | undefined;
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!me) return null;

  const save = async (change: Partial<Me>) => {
    await syncEngine().queue("members", "update", { id: me.id, ...change });
    void syncNow();
  };
  const draft = name ?? me.name;
  const nameOk = draft.trim().length >= 1 && draft.trim().length <= 40;

  async function upload(file: File) {
    setBusy(true);
    setNote(null);
    try {
      const blob = await shrinkPhoto(file);
      const { error } = await supabase().storage.from("family").upload(`home/${me!.id}.jpg`, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await save({ home_photo: `own:${Date.now()}` });
      setNote("Your photo is on your Home screen.");
    } catch {
      setNote("That didn't upload. Check your connection and try a smaller photo.");
    }
    setBusy(false);
  }

  const choice = me.home_photo === "family" ? "family" : me.home_photo ? "own" : "none";

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar avatar={me.avatar} name={me.name} size={56} />
        <h2 className="font-bold">You</h2>
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameOk || draft.trim() === me.name) return;
          void save({ name: draft.trim() });
          setName(null);
          setNote("Name saved.");
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">
          Name shown in the app
          <input value={draft} maxLength={40} onChange={(e) => setName(e.target.value)} className="min-h-12 rounded-xl border border-line bg-base px-3 font-normal" />
        </label>
        <button type="submit" disabled={!nameOk || draft.trim() === me.name} className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50">
          Save
        </button>
      </form>

      <p className="mt-4 text-sm font-bold">Your picture</p>
      <div className="mt-2">
        <AvatarPicker value={me.avatar} onPick={(a) => save({ avatar: a })} />
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-bold">Photo on your Home screen</legend>
        <div role="radiogroup" className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ["none", "None"],
              ["family", "Family photo"],
              ["own", "My own"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={choice === value}
              disabled={value === "own" && choice !== "own" && !online}
              onClick={() => (value === "none" ? save({ home_photo: null }) : value === "family" ? save({ home_photo: "family" }) : document.getElementById("own-photo")?.click())}
              className={`min-h-12 rounded-xl border px-2 text-sm font-bold disabled:opacity-50 ${choice === value ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label htmlFor="own-photo" className="mt-2 inline-flex min-h-12 cursor-pointer items-center font-bold text-brand underline underline-offset-4">
          {busy ? "Uploading…" : choice === "own" ? "Change my photo" : "Upload a photo"}
        </label>
        <input
          id="own-photo"
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy || !online}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-muted">It shows only on your own Home screen. Uploading needs signal.</p>
      </fieldset>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
    </Card>
  );
}
