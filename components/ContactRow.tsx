"use client";

import { useState } from "react";
import { telHref, whatsappHref, type Contact } from "@/lib/contacts";

// One contact: who they are, and Call / Copy number in one tap.
export function ContactRow({ contact, onEdit }: { contact: Contact; onEdit?: () => void }) {
  const [copied, setCopied] = useState(false);
  const tel = telHref(contact.phone);
  const wa = whatsappHref(contact.phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(contact.phone ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-bold">{contact.name}</span>
          {contact.is_emergency && <span className="ml-2 rounded-full bg-out-bg px-2 text-xs font-bold text-out-fg">Emergency</span>}
          <span className="block text-sm text-muted">{[contact.role, contact.area].filter(Boolean).join(" · ")}</span>
          {contact.note && <span className="mt-1 block whitespace-pre-line text-sm">{contact.note}</span>}
        </span>
        <span className="shrink-0 text-sm tabular">{contact.phone}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tel && (
          <a href={tel} className="flex min-h-12 items-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
            📞 Call
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-xl border border-line px-4 font-bold">
            WhatsApp
          </a>
        )}
        {contact.phone && (
          <button type="button" onClick={copy} className="min-h-12 rounded-xl border border-line px-4 font-bold" aria-live="polite">
            {copied ? "✓ Copied" : "Copy number"}
          </button>
        )}
        {onEdit && (
          <button type="button" onClick={onEdit} className="min-h-12 rounded-xl px-3 font-bold text-brand">
            Edit
          </button>
        )}
      </div>
    </li>
  );
}
