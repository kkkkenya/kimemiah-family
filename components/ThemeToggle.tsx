"use client";

import { useEffect, useState } from "react";
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { id: ThemeChoice; label: string; icon: string }[] = [
  { id: "system", label: "Same as phone", icon: "◐" },
  { id: "light", label: "Light", icon: "☀" },
  { id: "dark", label: "Dark", icon: "☾" },
];

/** Settings: Same as phone / Light / Dark, for this phone. */
export function ThemeCard() {
  const [t, setT] = useState<ThemeChoice>("system");
  useEffect(() => setT(getTheme()), []);
  return (
    <section aria-labelledby="appearance" className="rounded-2xl border border-line bg-raised p-5">
      <h2 id="appearance" className="font-display text-xl">
        Appearance
      </h2>
      <p className="text-sm text-muted">Dark mode is easier on the eyes at night. Only this phone changes.</p>
      <div role="radiogroup" aria-label="Appearance" className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={t === o.id}
            onClick={() => {
              setTheme(o.id);
              setT(o.id);
            }}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm ${t === o.id ? "border-ink bg-ink text-raised" : "border-line"}`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {o.icon}
            </span>
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** A one-tap light/dark switch for the laptop side rail. */
export function ThemeSwitch() {
  const [t, setT] = useState<ThemeChoice>("system");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const now = getTheme();
    setT(now);
    setDark(now === "dark" || (now === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        const next: ThemeChoice = dark ? "light" : "dark";
        setTheme(next);
        setT(next);
        setDark(!dark);
      }}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={t === "system" ? "Following the computer's setting" : undefined}
      className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-[#d3d3d3] hover:bg-white/10"
    >
      <span aria-hidden="true" className="text-lg">
        {dark ? "☀" : "☾"}
      </span>
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
