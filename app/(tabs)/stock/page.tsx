"use client";

import { Screen } from "@/components/Screen";
import { StockView } from "@/components/shop/StockView";
import { useStock } from "@/lib/shopping/useStock";

// Stock: everything in the house, with + / - and OK / Low / Out.
export default function StockPage() {
  const { me, shops, stock, movements, members } = useStock();
  return (
    <Screen title="Stock">
      <StockView stock={stock} movements={movements} shops={shops} members={members} meId={me?.id} />
    </Screen>
  );
}
