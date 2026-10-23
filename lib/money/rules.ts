// M-Pesa rules: "NAIVAS → Food", "NAIROBI WATER → Water bill". A pasted message's payee is
// matched against each rule; the longest match wins, so "NAIVAS KAHAWA" beats "NAIVAS".
export type Rule = { id: string; match: string; category_id?: string | null; bill_id?: string | null; shop_id?: string | null; sort?: number; deleted_at?: string | null };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

export function ruleFor(payee: string | null | undefined, rules: Rule[]): Rule | undefined {
  const p = ` ${norm(payee ?? "")} `;
  if (!p.trim()) return undefined;
  return rules
    .filter((r) => !r.deleted_at && norm(r.match).length >= 2 && p.includes(` ${norm(r.match)} `))
    .sort((a, b) => norm(b.match).length - norm(a.match).length)[0];
}

/** What to match on next time: the payee's name without branch words or account numbers. */
export function suggestMatch(payee: string): string {
  const name = norm(payee.replace(/\(.*?\)/g, " "))
    .split(" ")
    .filter((w) => !/^\d+$/.test(w));
  return name.slice(0, 2).join(" ");
}
