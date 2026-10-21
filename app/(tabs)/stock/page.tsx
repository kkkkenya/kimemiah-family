"use client";

import { useEffect, useState } from "react";
import { Screen } from "@/components/Screen";
import { StockView } from "@/components/shop/StockView";
import { ReceiptReader } from "@/components/stock/ReceiptReader";
import { useStock } from "@/lib/shopping/useStock";

// Stock: everything in the house (+ / -, OK / Low / Out, tools), and reading a receipt to restock.
export default function StockPage() {
  const { me, shops, stock, movements, members } = useStock();
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("receipt")) setReading(true);
  }, []);

  return (
    <Screen title="Stock">
      {reading ? (
        <ReceiptReader stock={stock} shops={shops} meId={me?.id} onClose={() => setReading(false)} />
      ) : (
        <button type="button" onClick={() => setReading(true)} className="min-h-14 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
          🧾 Read a receipt to restock
        </button>
      )}
      <StockView stock={stock} movements={movements} shops={shops} members={members} meId={me?.id} />
    </Screen>
  );
}
