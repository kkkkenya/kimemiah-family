"use client";

import { ContactSearch } from "@/components/ContactSearch";
import { Avatar } from "@/components/Avatar";
import { FamilyPhoto } from "@/components/FamilyPhoto";
import { PresenceCard } from "@/components/Presence";
import { PushCard } from "@/components/PushCard";
import { Screen } from "@/components/Screen";
import { JobAlerts } from "@/components/jobs/JobAlerts";
import { JobStats } from "@/components/jobs/JobStats";
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
      {me && (
        <div className="-mt-2 flex items-center gap-2">
          <Avatar avatar={(me as { avatar?: string | null }).avatar} name={me.name} size={44} />
          <span className="text-sm text-muted">Change your picture, name or Home photo in More › Settings.</span>
        </div>
      )}
      <ContactSearch />
      <JobAlerts link />
      <JobStats />
      <PresenceCard />
      <PushCard compact />
      <FamilyPhoto />
    </Screen>
  );
}
