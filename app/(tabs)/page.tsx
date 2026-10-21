"use client";

import { FamilyPhoto } from "@/components/FamilyPhoto";
import { Card, Empty, Screen } from "@/components/Screen";
import { useMe } from "@/lib/sync/hooks";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const me = useMe();
  const hello = greeting(new Date().getHours());

  return (
    <Screen title={me ? `${hello}, ${me.name}` : hello}>
      <FamilyPhoto />
      <Card>
        <h2 className="font-bold">Today</h2>
        <p className="text-muted">Items running out, shop runs, today&apos;s meals and money left will show here.</p>
      </Card>
      <Empty>Nothing needs you right now.</Empty>
    </Screen>
  );
}
