"use client";

import { useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { matchItem, parseReceipt, receiptPerPack, type HouseItem, type Receipt } from "@/lib/receipt/parser";
import { iconFor, unitPrice } from "@/lib/shopping/market";
import { kes } from "@/lib/shopping/pricing";
import type { Shop, StockItem } from "@/lib/shopping/shops";
import type { PutAwayLine } from "@/lib/shopping/stock";
import { syncEngine } from "@/lib/sync/client";
import { restockHouse } from "@/lib/sync/workflows";

type Row = { key: string; name: string; qty: number; total: number; itemId: string | ""; include: boolean };

/** Reads text from a receipt photo on the phone. The OCR library loads only now (it needs signal the first time). */
async function readPhoto(file: File, onProgress: (p: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && onProgress(m.progress),
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// Read a Naivas or Quickmart receipt (photo or pasted text), match each line to a house item,
// then add it all to stock, save the prices paid and log the spend, in one tap. It's kept as a
// past shop (every line, with prices) on the day of the receipt, which can be an earlier day.
export function ReceiptReader({ stock, shops, meId, onClose }: { stock: StockItem[]; shops: Shop[]; meId?: string; onClose: () => void }) {
  const { online, syncNow } = useSync();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [logSpend, setLogSpend] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const [day, setDay] = useState(today);

  const items = (stock.filter((s) => !s.deleted_at && s.track_mode !== "tool") as unknown as HouseItem[]).sort((a, b) => a.name.localeCompare(b.name));
  const itemById = new Map(items.map((i) => [i.id, i]));

  function read(t: string) {
    const r = parseReceipt(t);
    setReceipt(r);
    setRows(r.lines.map((l, i) => {
      const m = matchItem(l.name, items);
      return { key: `${i}`, name: l.name, qty: l.qty, total: l.total, itemId: m?.id ?? "", include: !!m };
    }));
  }

  async function fromPhoto(file: File) {
    setBusy("Reading the photo… 0%");
    try {
      const t = await readPhoto(file, (p) => setBusy(`Reading the photo… ${Math.round(p * 100)}%`));
      setText(t);
      read(t);
    } catch {
      setDone("Couldn't read that photo. Try a sharper, flatter photo in good light, or paste the text.");
    }
    setBusy(null);
  }

  const chosen = rows.filter((r) => r.include && r.itemId);
  const shopId = shops.find((s) => s.name === (receipt?.store === "naivas" ? "Naivas" : receipt?.store === "quickmart" ? "Quickmart" : ""))?.id ?? null;
  const total = receipt?.total ?? rows.reduce((s, r) => s + r.total, 0);

  async function apply() {
    const lines: PutAwayLine[] = chosen.map((r) => {
      const item = itemById.get(r.itemId)!;
      const weighed = r.qty % 1 !== 0; // 1.41 kg of onions: one line, not 1.41 packs
      return {
        extraId: `receipt:${r.key}`,
        itemId: r.itemId,
        title: r.name,
        shopId,
        level: item.track_mode === "level",
        qty: weighed ? 1 : r.qty,
        perPack: weighed ? r.qty : receiptPerPack(r.name, item),
        price: weighed ? r.total : r.total / r.qty,
      };
    });
    const storeName = receipt?.store === "naivas" ? "Naivas" : receipt?.store === "quickmart" ? "Quickmart" : "the shop";
    // The receipt as a past shop: when, where, and every line with its price.
    const tripId = crypto.randomUUID();
    const at = day === today ? new Date().toISOString() : new Date(`${day}T12:00:00+03:00`).toISOString();
    const engine = syncEngine();
    await engine.queue("shopping_trips", "insert", { id: tripId, shop_id: shopId, member_id: meId ?? null, started_at: at, finished_at: at, paid_kes: logSpend ? Math.round(total) : null });
    for (const r of rows) {
      const weighed = r.qty % 1 !== 0;
      await engine.queue("trip_lines", "insert", {
        id: crypto.randomUUID(),
        trip_id: tripId,
        item_id: r.include && r.itemId ? r.itemId : null,
        title: r.name,
        qty_bought: r.qty,
        unit: weighed ? "kg" : "piece",
        unit_price_kes: unitPrice(r.total, r.qty),
        total_kes: Math.round(r.total),
        icon: iconFor(r.name, stock.find((s) => s.id === r.itemId)?.category),
        ticked_at: at,
      });
    }
    const { spent } = await restockHouse(lines, {
      meId,
      logSpend,
      savePrices: true,
      tripId,
      occurredOn: day,
      receipt: { shopId, total, note: `Receipt from ${storeName}: ${rows.length} lines` },
    });
    void syncNow();
    setDone(`${lines.length === 1 ? "1 item" : `${lines.length} items`} added to stock${spent ? ` · ${kes(spent)} logged` : ""}. Prices saved; it's in Shop → Past shops.`);
    setReceipt(null);
    setRows([]);
    setText("");
  }

  return (
    <section aria-labelledby="receipt" className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="receipt" className="font-display text-xl">
          🧾 Read a receipt
        </h2>
        <button type="button" onClick={onClose} className="min-h-12 px-2 font-bold text-brand">
          Close
        </button>
      </div>

      {!receipt && (
        <>
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
            {busy ?? "📷 Take or pick a photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={!!busy || !online}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void fromPhoto(f);
                e.target.value = "";
              }}
            />
          </label>
          {!online && <p className="text-sm text-muted">Reading a photo needs signal the first time. Pasting text works offline.</p>}
          <label className="flex flex-col gap-1 text-sm font-bold">
            Or paste the receipt text
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"e.g.\n1 x 117.00\nFRESH WHITE BREAD 800GM 117.00"} className="w-full rounded-xl border border-line bg-base p-3 font-normal" />
          </label>
          <button type="button" disabled={!text.trim()} onClick={() => read(text)} className="min-h-12 rounded-xl border border-brand font-bold text-brand disabled:opacity-50">
            Read it
          </button>
        </>
      )}

      {receipt && (
        <>
          <p className="text-sm text-muted">
            {receipt.store ? (receipt.store === "naivas" ? "Naivas" : "Quickmart") : "Shop not found"} · {rows.length} lines
            {receipt.total ? ` · total ${kes(receipt.total)}` : ""}. Check each line&apos;s house item; untick anything to skip.
          </p>
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-col gap-1 py-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={r.include && !!r.itemId}
                    disabled={!r.itemId}
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, include: e.target.checked } : x)))}
                    className="mt-1 size-6 shrink-0"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-bold">{r.name}</span>
                    <span className="block tabular text-muted">
                      {r.qty % 1 ? `${r.qty.toFixed(2)} kg` : `${r.qty} ×`} · {kes(r.total)}
                    </span>
                  </span>
                </label>
                <select
                  aria-label={`House item for ${r.name}`}
                  value={r.itemId}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, itemId: e.target.value, include: !!e.target.value } : x)))}
                  className="min-h-12 rounded-xl border border-line bg-base px-2"
                >
                  <option value="">Not a house item (skip)</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Date on the receipt
            <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} className="min-h-12 rounded-xl border border-line bg-base px-3 font-normal" />
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={logSpend} onChange={(e) => setLogSpend(e.target.checked)} className="size-6" />
            Log {kes(total)} spent{receipt.store ? ` at ${receipt.store === "naivas" ? "Naivas" : "Quickmart"}` : ""}
          </label>
          <button type="button" disabled={!chosen.length} onClick={apply} className="min-h-14 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
            Add {chosen.length === 1 ? "1 item" : `${chosen.length} items`} to stock and save prices
          </button>
          <button type="button" onClick={() => setReceipt(null)} className="min-h-12 font-bold text-brand">
            Start again
          </button>
        </>
      )}
      {done && <p className="text-sm text-ok-fg">{done}</p>}
    </section>
  );
}
