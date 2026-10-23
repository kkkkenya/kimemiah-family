import Link from "next/link";
import type { ReactNode } from "react";
import { SyncDot } from "./SyncDot";

const HEADER_LINKS = [
  { href: "/more/contacts", label: "Contacts", icon: <path d="M6.6 3.5h2.8l1.4 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.4v2.8a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /> },
  { href: "/more/meeting", label: "Meeting", icon: <><circle cx="8" cy="9" r="2.5" /><circle cx="16" cy="9" r="2.5" /><path d="M3.5 19c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5M11.5 19c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5" /></> },
  { href: "/more/settings", label: "Settings", icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></> },
];

// Page frame: frosted white title bar on a hairline, optional back arrow, Contacts / Meeting /
// Settings at the top right, then the content.
export function Screen({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 mb-4 border-b border-line bg-raised/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3 lg:max-w-5xl lg:px-6">
          {back && (
            <Link href={back} aria-label="Back" className="-ml-2 flex size-12 items-center justify-center rounded-md text-brand hover:bg-base">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m15 5-7 7 7 7" />
              </svg>
            </Link>
          )}
          <h1 className="min-w-0 flex-1 font-display text-[1.75rem] leading-[1.14] text-balance lg:text-[2.5rem] lg:leading-[1.05]">{title}</h1>
          <SyncDot />
          <nav aria-label="More" className="-mr-2 flex shrink-0">
            {HEADER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-label={l.label} title={l.label} className="flex size-12 items-center justify-center rounded-md text-brand hover:bg-base">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {l.icon}
                </svg>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 lg:block lg:max-w-5xl lg:columns-2 lg:gap-4 lg:px-6 lg:[&>*]:mb-4 lg:[&>*]:break-inside-avoid lg:[&>:not(section)]:[column-span:all]">{children}</main>
    </>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-raised p-5">{children}</section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">{children}</p>;
}
