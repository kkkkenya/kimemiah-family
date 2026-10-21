"use client";

import { useEffect } from "react";

export type UndoState = { id: number; message: string; undo?: () => void } | null;

// Short confirmation above the bottom bar, with Undo instead of "Are you sure?".
export function UndoBar({ state, onClose }: { state: UndoState; onClose: () => void }) {
  useEffect(() => {
    if (!state) return;
    const t = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(t);
  }, [state, onClose]);

  if (!state) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-30 px-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl bg-ink px-4 py-2 text-base shadow-lg">
        <span className="text-base text-[color:var(--surface-base)]">{state.message}</span>
        {state.undo && (
          <button
            type="button"
            onClick={() => {
              state.undo?.();
              onClose();
            }}
            className="min-h-12 px-3 font-bold text-[color:var(--surface-base)] underline underline-offset-4"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
