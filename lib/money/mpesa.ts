// Reads a pasted M-Pesa confirmation SMS: who, how much, which way, when, and the code (so the
// same message is never logged twice). Cash withdrawals and own-account moves aren't spending.

export type MpesaKind = "paid" | "sent" | "received" | "withdraw";
export type Mpesa = { code: string; kind: MpesaKind; direction: "in" | "out" | null; amount: number; counterparty: string | null; date: string | null };

const amountOf = (s: string) => Number(s.replace(/,/g, ""));

/** "21/10/26" -> "2026-10-21" */
function isoDate(d: string | undefined): string | null {
  const m = d?.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const clean = (s: string) =>
  s
    .replace(/\s+\d{9,12}$/, "") // phone number after a name
    .replace(/[.\s]+$/, "")
    .trim();

export function parseMpesa(text: string): Mpesa | null {
  const t = text.replace(/\s+/g, " ").trim();
  const code = t.match(/\b([A-Z0-9]{10})\b\s*Confirmed/i)?.[1]?.toUpperCase() ?? t.match(/^([A-Z0-9]{10})\b/)?.[1];
  if (!code) return null;
  const date = isoDate(t.match(/on (\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1]);

  let m = t.match(/received Ksh\s?([\d,]+(?:\.\d{1,2})?) from (.+?) on \d/i);
  if (m) return { code, kind: "received", direction: "in", amount: amountOf(m[1]), counterparty: clean(m[2]), date };

  m = t.match(/Ksh\s?([\d,]+(?:\.\d{1,2})?) paid to (.+?)\s*(?:\.\s*)?on \d/i);
  if (m) return { code, kind: "paid", direction: "out", amount: amountOf(m[1]), counterparty: clean(m[2]), date };

  m = t.match(/Ksh\s?([\d,]+(?:\.\d{1,2})?) sent to (.+?)(?: for account (.+?))? on \d/i);
  if (m) return { code, kind: "sent", direction: "out", amount: amountOf(m[1]), counterparty: clean(m[3] ? `${m[2]} (${m[3]})` : m[2]), date };

  m = t.match(/Withdraw Ksh\s?([\d,]+(?:\.\d{1,2})?) from (.+?)(?: New|\.|$)/i);
  if (m) return { code, kind: "withdraw", direction: null, amount: amountOf(m[1]), counterparty: clean(m[2]), date };

  return null;
}
