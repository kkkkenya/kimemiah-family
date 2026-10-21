// The house phone book: search and order. Pure, so it works offline and is tested.

export type Contact = {
  id: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  area?: string | null;
  note?: string | null;
  is_emergency?: boolean;
  sort?: number;
  deleted_at?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Every word must match the name, role, area or note; digits also match the number ("0722", "plumber kahawa"). */
export function matchContact(c: Contact, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${norm(c.name)} ${norm(c.role)} ${norm(c.area)} ${norm(c.note)}`;
  return words.every((w) => hay.includes(w) || (/^\+?\d+$/.test(w) && digits(c.phone).includes(digits(w))));
}

/** Emergency numbers first, then by the family's order, then A to Z. */
export function sortContacts(list: Contact[]): Contact[] {
  return [...list]
    .filter((c) => !c.deleted_at)
    .sort((a, b) => Number(!!b.is_emergency) - Number(!!a.is_emergency) || (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
}

/** A Kenyan number to dial: 0722 123 456 -> +254722123456; others kept as typed (digits and +). */
export function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").replace(/[^\d+]/g, "");
  if (!raw) return null;
  if (/^0[17]\d{8}$/.test(raw)) return `tel:+254${raw.slice(1)}`;
  if (/^254\d{9}$/.test(raw)) return `tel:+${raw}`;
  return `tel:${raw}`;
}
