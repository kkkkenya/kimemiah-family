"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A panel that slides up from the bottom for a card's details. Closes with the X, Escape or a
// tap on the dimmed page behind it.
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="sheet-in relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-base px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl outline-none"
      >
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-base px-4 pb-2">
          <span aria-hidden="true" className="mx-auto mt-1 block h-1.5 w-12 rounded-full bg-line" />
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-1 flex size-12 items-center justify-center text-muted">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
