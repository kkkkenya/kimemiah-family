"use client";

import { useCallback, useEffect, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { isCounted, kes, stockStatus, type Flex, type Status, type StockLike, type Tier } from "@/lib/shopping/pricing";
import { itemHistory, ranOutEarly, type LevelChange, type Movement } from "@/lib/shopping/stock";
import type { Shop, StockItem } from "@/lib/shopping/shops";
import { supabase } from "@/lib/supabase/client";
import { syncEngine } from "@/lib/sync/client";
import type { Member } from "@/lib/sync/hooks";

const CATEGORIES: Record<string, string> = {
  kitchen_staples: "Kitchen staples",
  fresh_produce: "Fresh produce",
  drinks_breakfast: "Breakfast and drinks",
  cleaning: "Cleaning",
  bathroom: "Bathroom",
  utilities: "Gas, power and fuel",
  drinks_alcohol: "Drinks for guests",
  home_upgrades: "Home upgrades",
};
const categoryName = (c: string) => CATEGORIES[c] ?? c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
const categoryRank = (c: string) => {
  const i = Object.keys(CATEGORIES).indexOf(c);
  return i === -1 ? 99 : i;
};

const STATUS: Record<Status | "unknown", { icon: string; word: string; cls: string }> = {
  ok: { icon: "✓", word: "OK", cls: "bg-ok-bg text-ok-fg" },
  low: { icon: "!", word: "Low", cls: "bg-low-bg text-low-fg" },
  out: { icon: "✕", word: "Out", cls: "bg-out-bg text-out-fg" },
  unknown: { icon: "?", word: "Not checked", cls: "bg-base text-muted" },
};

const LEVELS: Status[] = ["ok", "low", "out"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

type Item = StockItem & StockLike & { early_depletion_streak?: number };

// Stock: + / − for packaged items, one tap OK / Low / Out for fresh produce, grouped by category.
export function StockView({ stock, movements, shops, members, meId }: { stock: Item[]; movements: Movement[]; shops: Shop[]; members: Member[]; meId?: string }) {
  const { syncNow } = useSync();
  const [undo, setUndo] = useState<UndoState>(null);
  const [open, setOpen] = useState<string | null>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

  const out = stock.filter((s) => isCounted(s) && stockStatus(s) === "out").length;
  const low = stock.filter((s) => isCounted(s) && stockStatus(s) === "low").length;

  async function move(s: Item, delta: number, reason: string) {
    await syncEngine().queue("stock_movements", "insert", { id: crypto.randomUUID(), item_id: s.id, delta, reason, trip_id: null });
    void syncNow();
  }

  async function step(s: Item, delta: 1 | -1) {
    await move(s, delta, delta > 0 ? "adjust" : "used");
    setUndo({ id: Date.now(), message: `${s.name} ${delta > 0 ? "+1" : "−1"}`, undo: () => move(s, -delta, "undo") });
  }

  async function setLevel(s: Item, level: Status) {
    const before = s.level ?? "ok";
    if (before === level && isCounted(s)) return;
    // actor_id is set by the server; sent here only so this phone shows the item as checked straight away.
    await syncEngine().queue("stock_items", "update", { id: s.id, level, actor_id: s.actor_id ?? meId ?? null });
    void syncNow();
    setUndo({
      id: Date.now(),
      message: `${s.name}: ${STATUS[level].word}`,
      undo: async () => {
        await syncEngine().queue("stock_items", "update", { id: s.id, level: before });
        void syncNow();
      },
    });
  }

  const groups = [...new Set(stock.map((s) => s.category))]
    .sort((a, b) => categoryRank(a) - categoryRank(b))
    .map((c) => ({ category: c, items: stock.filter((s) => s.category === c).sort((a, b) => a.sort - b.sort) }));

  return (
    <>
      <p className="text-muted">
        {out || low ? `${out} out · ${low} low. They're on the shopping list.` : "Tap − when you use something up, + when you add some."}
      </p>

      {groups.map(({ category, items }) => (
        <section key={category} aria-labelledby={`cat-${category}`} className="overflow-hidden rounded-xl bg-raised shadow-[0_1px_3px_rgba(10,51,35,.10)]">
          <h2 id={`cat-${category}`} className="border-b border-line px-4 py-3 font-display text-xl">
            {categoryName(category)}
          </h2>
          <ul className="divide-y divide-line">
            {items.map((s) => (
              <StockRow
                key={s.id}
                item={s}
                open={open === s.id}
                onOpen={() => setOpen(open === s.id ? null : s.id)}
                onStep={(d) => step(s, d)}
                onLevel={(l) => setLevel(s, l)}
                movements={movements}
                shops={shops}
                members={members}
                onSaved={(name) => setUndo({ id: Date.now(), message: `${name} saved` })}
              />
            ))}
          </ul>
        </section>
      ))}

      <UndoBar state={undo} onClose={closeUndo} />
    </>
  );
}

function StatusTag({ item }: { item: Item }) {
  const s = STATUS[isCounted(item) ? stockStatus(item) : "unknown"];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 text-sm font-bold ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.word}
    </span>
  );
}

function StockRow({
  item,
  open,
  onOpen,
  onStep,
  onLevel,
  movements,
  shops,
  members,
  onSaved,
}: {
  item: Item;
  open: boolean;
  onOpen: () => void;
  onStep: (d: 1 | -1) => void;
  onLevel: (l: Status) => void;
  movements: Movement[];
  shops: Shop[];
  members: Member[];
  onSaved: (name: string) => void;
}) {
  const level = item.track_mode === "level";
  const have = Number(item.have_qty ?? 0);
  const btn = "flex size-14 shrink-0 items-center justify-center rounded-xl border border-line bg-base text-2xl font-bold disabled:opacity-40";

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <button type="button" aria-expanded={open} onClick={onOpen} className="min-h-14 min-w-0 flex-1 text-left">
          <span className="block font-bold">{item.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <StatusTag item={item} />
            {!level && <span className="tabular">{`${have} ${item.unit} · min ${item.min_qty}`}</span>}
          </span>
        </button>
        {level ? (
          <div role="group" aria-label={`${item.name} level`} className="flex shrink-0 gap-1">
            {LEVELS.map((l) => {
              const on = isCounted(item) && (item.level ?? "ok") === l;
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onLevel(l)}
                  className={`min-h-14 min-w-14 rounded-xl border px-2 text-sm font-bold ${on ? `border-transparent ${STATUS[l].cls}` : "border-line bg-base"}`}
                >
                  <span aria-hidden="true">{STATUS[l].icon} </span>
                  {STATUS[l].word}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => onStep(-1)} disabled={have <= 0} aria-label={`${item.name} minus one`} className={btn}>
              −
            </button>
            <button type="button" onClick={() => onStep(1)} aria-label={`${item.name} plus one`} className={btn}>
              +
            </button>
          </div>
        )}
      </div>
      {ranOutEarly(item) && <p className="mt-1 text-sm text-low-fg">Ran out early last 2 runs. Consider buying more.</p>}
      {open && <ItemDetails item={item} movements={movements} shops={shops} members={members} onSaved={onSaved} />}
    </li>
  );
}

function ItemDetails({ item, movements, shops, members, onSaved }: { item: Item; movements: Movement[]; shops: Shop[]; members: Member[]; onSaved: (name: string) => void }) {
  const { online, syncNow } = useSync();
  const [editing, setEditing] = useState(false);
  const [levels, setLevels] = useState<LevelChange[] | null>(null);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";

  // OK / Low / Out changes live in the activity log on the server; counts are on the phone.
  const wantsLog = item.track_mode === "level" && online;
  useEffect(() => {
    if (!wantsLog) return;
    let live = true;
    void supabase()
      .from("audit_log")
      .select("at, actor_id, old, new")
      .eq("table_name", "stock_items")
      .eq("row_id", item.id)
      .order("at", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (!live) return;
        setLevels(
          (data ?? []).map((r) => ({
            at: r.at as string,
            actor_id: (r.actor_id as string | null) ?? null,
            from: (r.old as { level?: string } | null)?.level ?? null,
            to: (r.new as { level: string }).level,
          })),
        );
      });
    return () => {
      live = false;
    };
  }, [wantsLog, item.id, item.level]);

  const history = itemHistory(item.id, movements, levels ?? []);

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-xl bg-base p-3">
      <div className="text-sm text-muted">
        {[shops.find((s) => s.id === item.shop_id)?.name, item.usual_price_kes ? `usual ${kes(item.usual_price_kes)}` : null, item.is_fast_mover ? "fast mover" : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div>
        <h3 className="font-bold">Recent changes</h3>
        {history.length ? (
          <ul className="text-sm">
            {history.map((h, i) => (
              <li key={i} className="tabular">
                {h.text} · {nameOf(h.actor_id)} · {when(h.at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {item.track_mode === "level" && !online ? "OK / Low / Out history shows when there's signal." : "No changes yet."}
          </p>
        )}
      </div>
      {editing ? (
        <EditItem
          item={item}
          shops={shops}
          onDone={async (changes) => {
            setEditing(false);
            if (!changes) return;
            await syncEngine().queue("stock_items", "update", { id: item.id, ...changes });
            void syncNow();
            onSaved(item.name);
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="min-h-12 self-start rounded-xl border border-line px-4 font-bold text-brand">
          Edit item
        </button>
      )}
    </div>
  );
}

const TIERS: { value: Tier; label: string }[] = [
  { value: "essential", label: "Essential" },
  { value: "standard", label: "Full shop" },
  { value: "qol", label: "Can wait" },
];
const FLEX: { value: Flex; label: string }[] = [
  { value: "any_cheapest", label: "Any brand (cheapest)" },
  { value: "prefer_named", label: "Prefer this brand" },
  { value: "strict_named", label: "Only this brand" },
];

const field = "min-h-12 w-full rounded-xl border border-line bg-raised px-3";

function EditItem({ item, shops, onDone }: { item: Item; shops: Shop[]; onDone: (changes: Partial<Item> | null) => void }) {
  const [minQty, setMinQty] = useState(String(item.min_qty ?? 0));
  const [unit, setUnit] = useState(item.unit);
  const [price, setPrice] = useState(item.usual_price_kes ? String(item.usual_price_kes) : "");
  const [shopId, setShopId] = useState(item.shop_id ?? "");
  const [tier, setTier] = useState<Tier>(item.shopping_tier ?? "standard");
  const [fast, setFast] = useState(Boolean(item.is_fast_mover));
  const [brand, setBrand] = useState(item.preferred_brand ?? "");
  const [flex, setFlex] = useState<Flex>(item.brand_flexibility ?? "any_cheapest");

  const min = Number(minQty.replace(",", "."));
  const usual = price.trim() ? Number(price.replace(/[, ]/g, "")) : null;
  const valid = Number.isFinite(min) && min >= 0 && unit.trim() !== "" && (usual === null || (Number.isFinite(usual) && usual > 0));

  function save() {
    const next: Partial<Item> = {
      min_qty: min,
      unit: unit.trim(),
      usual_price_kes: usual,
      shop_id: shopId || null,
      shopping_tier: tier,
      is_fast_mover: fast,
      preferred_brand: brand.trim() || null,
      brand_flexibility: brand.trim() ? flex : "any_cheapest",
    };
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => (item as Record<string, unknown>)[k] !== v));
    onDone(Object.keys(changed).length ? changed : null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Minimum
          <input inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Usual price (KES)
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="None" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Usual shop
          <select value={shopId} onChange={(e) => setShopId(e.target.value)} className={field}>
            <option value="">Any</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div role="radiogroup" aria-label="Which shop run" className="grid grid-cols-3 gap-2">
        {TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={tier === t.value}
            onClick={() => setTier(t.value)}
            className={`min-h-12 rounded-xl border text-sm font-bold ${tier === t.value ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} className="size-6" />
        Fast mover (runs out between big runs)
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Preferred brand
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Any brand" className={field} />
      </label>
      {brand.trim() && (
        <select aria-label="Brand rule" value={flex} onChange={(e) => setFlex(e.target.value as Flex)} className={field}>
          {FLEX.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={!valid} onClick={save} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => onDone(null)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
          Cancel
        </button>
      </div>
    </div>
  );
}
