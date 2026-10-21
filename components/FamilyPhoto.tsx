"use client";

import { useFamilyImage } from "@/lib/images";
import { useMe } from "@/lib/sync/hooks";

type WithPhoto = { id: string; home_photo?: string | null };

/** Where my chosen Home photo lives: the family photo, or my own upload (versioned by upload time). */
export function homePhotoPath(me: WithPhoto | undefined): { path: string; version: string } | null {
  if (!me?.home_photo) return null;
  if (me.home_photo === "family") return { path: "home.jpg", version: "family" };
  return { path: `home/${me.id}.jpg`, version: me.home_photo.slice(4) };
}

// The Home photo, only if this person chose one in Settings (the family photo or their own).
export function FamilyPhoto() {
  const me = useMe() as WithPhoto | undefined;
  const photo = homePhotoPath(me);
  const url = useFamilyImage(photo?.path ?? null, photo?.version);
  if (!url) return null;
  return (
    <figure className="overflow-hidden rounded-xl bg-raised shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
      <img src={url} alt={me?.home_photo === "family" ? "The family together at home" : "Your Home photo"} className="aspect-[4/3] w-full object-cover" />
      <div className="kanga h-1" />
    </figure>
  );
}
