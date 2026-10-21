"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const TABS = [
  { href: "/", label: "Home", icon: icon(<path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />) },
  { href: "/shop", label: "Shop", icon: icon(<><path d="M5 7h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3Z" /><path d="M9 7V5.5a3 3 0 0 1 6 0V7" /></>) },
  { href: "/jobs", label: "Jobs", icon: icon(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="m9 12 2 2 4-4M9 4V3h6v1" /></>) },
  { href: "/money", label: "Money", icon: icon(<><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /></>) },
  { href: "/more", label: "More", icon: icon(<><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>) },
];

export function BottomNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold ${
                active(t.href) ? "text-brand" : "text-muted"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
