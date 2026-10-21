"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ContactRow } from "@/components/ContactRow";
import { Empty, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { matchContact, sortContacts, type Contact } from "@/lib/contacts";
import { syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";

type Row = Contact & { [key: string]: unknown };
const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
const blank = { name: "", role: "", phone: "", area: "", note: "", is_emergency: false };

// The house phone book: fundi, plumber, landlord, gas, water, clinic. Works offline.
export default function ContactsPage() {
  const { syncNow } = useSync();
  const contacts = sortContacts((useRows<Row>("contacts") ?? []) as Contact[]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

  const shown = contacts.filter((c) => matchContact(c, query));

  function open(c?: Contact) {
    setEditing(c ? c.id : "new");
    setForm(c ? { name: c.name, role: c.role ?? "", phone: c.phone ?? "", area: c.area ?? "", note: c.note ?? "", is_emergency: !!c.is_emergency } : blank);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const row = {
      name: form.name.trim(),
      role: form.role.trim() || null,
      phone: form.phone.trim() || null,
      area: form.area.trim() || null,
      note: form.note.trim() || null,
      is_emergency: form.is_emergency,
    };
    if (editing === "new") await syncEngine().queue("contacts", "insert", { id: crypto.randomUUID(), ...row, sort: 0 });
    else if (editing) await syncEngine().queue("contacts", "update", { id: editing, ...row });
    void syncNow();
    setEditing(null);
    setUndo({ id: Date.now(), message: `${row.name} saved` });
  }

  async function remove(c: Contact) {
    await syncEngine().queue("contacts", "delete", { id: c.id });
    void syncNow();
    setEditing(null);
    setUndo({
      id: Date.now(),
      message: `${c.name} removed`,
      undo: async () => {
        const { id: _id, deleted_at: _d, ...rest } = c;
        void _id;
        void _d;
        await syncEngine().queue("contacts", "insert", { ...rest, id: crypto.randomUUID() });
        void syncNow();
      },
    });
  }

  const editor = (c?: Contact) => (
    <form onSubmit={save} className="flex flex-col gap-2 rounded-xl border-2 border-brand bg-raised p-4">
      <h2 className="font-bold">{c ? `Edit ${c.name}` : "Add a contact"}</h2>
      {(
        [
          ["name", "Name", "e.g. Otieno"],
          ["role", "What they do", "e.g. Plumber"],
          ["phone", "Phone", "e.g. 0722 123 456"],
          ["area", "Area", "e.g. Kahawa Sukari"],
          ["note", "Note", "e.g. Call before 6pm"],
        ] as const
      ).map(([key, label, hint]) => (
        <label key={key} className="flex flex-col gap-1 text-sm font-bold">
          {label}
          <input
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            placeholder={hint}
            inputMode={key === "phone" ? "tel" : undefined}
            className={field}
          />
        </label>
      ))}
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={form.is_emergency} onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })} className="size-6" />
        Emergency number (shown first)
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!form.name.trim()} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setEditing(null)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
          Cancel
        </button>
        {c && (
          <button type="button" onClick={() => remove(c)} className="min-h-12 rounded-xl px-4 font-bold text-out-strong">
            Remove
          </button>
        )}
      </div>
    </form>
  );

  return (
    <Screen title="Contacts" back="/more">
      <div className="flex gap-2">
        <label htmlFor="contact-search" className="sr-only">
          Search contacts
        </label>
        <input id="contact-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, job, area or number" className={field} />
        <button type="button" onClick={() => open()} className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
          + Add
        </button>
      </div>

      {editing === "new" && editor()}

      {shown.length ? (
        <ul className="divide-y divide-line rounded-xl bg-raised px-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
          {shown.map((c) => (editing === c.id ? <li key={c.id} className="py-3">{editor(c)}</li> : <ContactRow key={c.id} contact={c} onEdit={() => open(c)} />))}
        </ul>
      ) : (
        <Empty>{contacts.length ? "No contact matches that." : "No contacts yet. Add the fundi, plumber, gas delivery, water vendor and clinic."}</Empty>
      )}

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}
