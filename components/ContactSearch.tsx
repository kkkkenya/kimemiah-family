"use client";

import Link from "next/link";
import { useState } from "react";
import { matchContact, sortContacts, type Contact } from "@/lib/contacts";
import { useRows } from "@/lib/sync/hooks";
import { ContactRow } from "./ContactRow";

// Home's contact search: type a name, job or area and call in one tap.
export function ContactSearch() {
  const contacts = sortContacts((useRows<Contact & { [key: string]: unknown }>("contacts") ?? []) as Contact[]);
  const [query, setQuery] = useState("");
  const hits = query.trim() ? contacts.filter((c) => matchContact(c, query)).slice(0, 4) : [];

  return (
    <section aria-label="Find a contact">
      <label htmlFor="home-contacts" className="sr-only">
        Find a contact
      </label>
      <input
        id="home-contacts"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a contact (plumber, gas, clinic…)"
        className="min-h-12 w-full rounded-xl border border-line bg-raised px-3"
      />
      {query.trim() && (
        <div className="mt-2 rounded-2xl bg-raised px-4 border border-line">
          {hits.length ? (
            <ul className="divide-y divide-line">
              {hits.map((c) => (
                <ContactRow key={c.id} contact={c} />
              ))}
            </ul>
          ) : (
            <p className="py-3 text-muted">
              Nobody matches.{" "}
              <Link href="/more/contacts" className="font-bold text-brand underline underline-offset-4">
                Add a contact
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
