import Link from "next/link";
import type { ReactNode } from "react";

// Page frame: title bar with the kanga stripe, optional back arrow, content.
export function Screen({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-base pt-[env(safe-area-inset-top)]">
        <div className="kanga h-1" />
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3">
          {back && (
            <Link href={back} aria-label="Back" className="-ml-2 flex size-12 items-center justify-center rounded-full text-brand">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m15 5-7 7 7 7" />
              </svg>
            </Link>
          )}
          <h1 className="font-display text-[1.75rem] leading-tight text-balance">{title}</h1>
        </div>
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6">{children}</main>
    </>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">{children}</section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">{children}</p>;
}
