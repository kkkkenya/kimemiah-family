"use client";

import { Avatar } from "@/components/Avatar";
import { ContactSearch } from "@/components/ContactSearch";
import { FamilyPhoto } from "@/components/FamilyPhoto";
import { EssentialsCard, LiveBanners, MyJobs, OpenJobsCard, PeterCard, QuickStrip, SupperPill, UpgradeDealsCard } from "@/components/home/HomeCards";
import { PresenceCard } from "@/components/Presence";
import { PushCard } from "@/components/PushCard";
import { Screen } from "@/components/Screen";
import { JobAlerts } from "@/components/jobs/JobAlerts";
import { JobStats } from "@/components/jobs/JobStats";
import { useMe } from "@/lib/sync/hooks";

// Today: what's urgent first, then my jobs, what's needed, and how the house is doing.
export default function HomePage() {
  const me = useMe();
  return (
    <Screen title={me ? `Habari, ${me.name}` : "Habari"}>
      {me && (
        <div className="-mt-2 flex flex-wrap items-center gap-3">
          <Avatar avatar={(me as { avatar?: string | null }).avatar} name={me.name} size={44} />
          <SupperPill />
        </div>
      )}
      <PeterCard />
      <JobAlerts link />
      <LiveBanners />
      <MyJobs />
      <QuickStrip />
      <EssentialsCard />
      <UpgradeDealsCard />
      <OpenJobsCard />
      <JobStats />
      <PresenceCard />
      <ContactSearch />
      <PushCard compact />
      <FamilyPhoto />
    </Screen>
  );
}
