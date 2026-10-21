"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { localDB } from "@/lib/sync/client";
import { getMeta, setMeta } from "@/lib/sync/db";

const REFRESH_MS = 24 * 60 * 60 * 1000;
type Cached = { blob: Blob; fetchedAt: number };

/**
 * A picture from the private "family" bucket, kept on the phone so it shows offline and
 * fetched again at most once a day. `version` changes the cache key when a picture is replaced.
 */
export function useFamilyImage(path: string | null, version = ""): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return setUrl(null);
    let objectUrl: string | null = null;
    let cancelled = false;
    const key = `img:${path}:${version}`;
    const show = (blob: Blob) => {
      if (cancelled) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    };
    (async () => {
      const db = localDB();
      const cached = await getMeta<Cached>(db, key);
      if (cached?.blob) show(cached.blob);
      if (cached && Date.now() - cached.fetchedAt < REFRESH_MS) return;
      if (!navigator.onLine) return;
      const { data } = await supabase().storage.from("family").download(path);
      if (data) {
        await setMeta(db, key, { blob: data, fetchedAt: Date.now() });
        show(data);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, version]);

  return url;
}

/** Shrink a photo on the phone (max 1200 px, JPEG), which also drops its hidden location details. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo"))), "image/jpeg", 0.8));
}
