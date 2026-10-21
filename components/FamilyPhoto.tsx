"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { localDB } from "@/lib/sync/client";
import { getMeta, setMeta } from "@/lib/sync/db";

const KEY = "photo:home";
const REFRESH_MS = 24 * 60 * 60 * 1000;

type Cached = { blob: Blob; fetchedAt: number };

// The family photo from the private bucket. Kept on the phone so it shows offline;
// fetched again at most once a day.
export function FamilyPhoto() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const show = (blob: Blob) => {
      if (cancelled) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    };

    (async () => {
      const db = localDB();
      const cached = await getMeta<Cached>(db, KEY);
      if (cached?.blob) show(cached.blob);
      const stale = !cached || Date.now() - cached.fetchedAt > REFRESH_MS;
      if (!stale || !navigator.onLine) return;
      const { data } = await supabase().storage.from("family").download("home.jpg");
      if (data) {
        await setMeta(db, KEY, { blob: data, fetchedAt: Date.now() });
        show(data);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  if (!url) return null;
  return (
    <figure className="overflow-hidden rounded-xl bg-raised shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
      <img src={url} alt="The Kimemiah family together at home" className="aspect-[4/3] w-full object-cover" />
      <div className="kanga h-1" />
    </figure>
  );
}
