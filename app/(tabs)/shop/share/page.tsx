"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Screen } from "@/components/Screen";
import { isActive, SHARED_SMS, type Trip } from "@/lib/shopping/market";
import { localDB } from "@/lib/sync/client";

// Share → Kimemiah from the SMS app. The message waits in this tab; if you're out shopping it
// goes to the basket's pay sheet, otherwise to Money's form. Either one reads the amount for you.
export default function SharePage() {
  const router = useRouter();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const text = [q.get("text"), q.get("title"), q.get("url")].filter(Boolean).join(" ").trim();
    void (async () => {
      try {
        if (text) sessionStorage.setItem(SHARED_SMS, text);
      } catch {}
      const memberId = (await localDB().meta.get("memberId"))?.value as string | undefined;
      const trips = (await localDB().rows("shopping_trips").toArray()) as unknown as Trip[];
      const shopping = trips.some((t) => isActive(t) && t.member_id === memberId);
      router.replace(shopping ? "/shop/basket" : "/money");
    })();
  }, [router]);
  return (
    <Screen title="One moment">
      <p className="text-muted">Reading the message…</p>
    </Screen>
  );
}
