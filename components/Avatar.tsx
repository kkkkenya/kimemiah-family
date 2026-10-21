"use client";

import { useFamilyImage } from "@/lib/images";

// Pictures uploaded by scripts/upload-avatars.mjs as family/avatars/a1.jpg ... a8.jpg.
export const AVATARS = Array.from({ length: 8 }, (_, i) => `a${i + 1}`);

/** A person's picture, or their first letter if they haven't picked one. */
export function Avatar({ avatar, name, size = 40 }: { avatar?: string | null; name: string; size?: number }) {
  const url = useFamilyImage(avatar ? `avatars/${avatar}.jpg` : null, "1");
  const style = { width: size, height: size };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
    <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" style={style} className="flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-brand-contrast">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Choice({ id, selected, onPick }: { id: string; selected: boolean; onPick: (id: string) => void }) {
  const url = useFamilyImage(`avatars/${id}.jpg`, "1");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Picture ${id.slice(1)}`}
      onClick={() => onPick(id)}
      className={`aspect-square overflow-hidden rounded-full border-4 ${selected ? "border-brand" : "border-transparent"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <span className="block size-full bg-base" />}
    </button>
  );
}

/** Pick your picture: a grid of the family's pictures. */
export function AvatarPicker({ value, onPick }: { value?: string | null; onPick: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Your picture" className="grid grid-cols-4 gap-3">
      {AVATARS.map((id) => (
        <Choice key={id} id={id} selected={value === id} onPick={onPick} />
      ))}
    </div>
  );
}
