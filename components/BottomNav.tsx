"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeSwitch } from "./ThemeToggle";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const TABS = [
  { href: "/", label: "Home", icon: icon(<path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />) },
  { href: "/stock", label: "Stock", icon: icon(<><path d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5Z" /><path d="M4 8.5 12 13l8-4.5M12 13v9" /></>) },
  { href: "/shop", label: "Shop", icon: icon(<><path d="M5 7h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3Z" /><path d="M9 7V5.5a3 3 0 0 1 6 0V7" /></>) },
  { href: "/jobs", label: "Jobs", icon: icon(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="m9 12 2 2 4-4M9 4V3h6v1" /></>) },
  { href: "/money", label: "Money", icon: icon(<><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /></>) },
];

export function BottomNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // Money and Jobs use the Monarch look, so their tab lights up in its orange.
  const tint = (href: string) => (href === "/money" || href === "/jobs" ? "bg-[#ff692d] text-[#22201d]" : "bg-action text-action-ink");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:inset-y-0 lg:right-auto lg:w-56 lg:border-0 lg:bg-[#1a1919]"
    >
      <p className="hidden px-6 pb-6 pt-7 font-display text-2xl leading-none text-white lg:block">Kimemiah</p>
      <ul className="mx-auto grid max-w-xl grid-cols-5 lg:flex lg:flex-col lg:gap-1 lg:px-3">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:text-base ${
                !active(t.href) ? "text-muted lg:text-[#d3d3d3] lg:hover:bg-white/10" : t.href === "/money" || t.href === "/jobs" ? "text-ink lg:bg-[#ff692d] lg:text-[#22201d]" : "text-ink lg:bg-action lg:text-action-ink"
              }`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-md lg:w-auto lg:bg-transparent ${active(t.href) ? tint(t.href) : ""}`}>{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="absolute inset-x-3 bottom-4 hidden lg:block">
        <ThemeSwitch />
      </div>
    </nav>
  );
}
