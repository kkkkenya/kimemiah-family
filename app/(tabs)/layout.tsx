import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { SyncProvider } from "@/components/SyncProvider";
import { SyncStatus } from "@/components/SyncStatus";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <SyncProvider>
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <SyncStatus />
        {children}
      </div>
      <BottomNav />
    </SyncProvider>
  );
}
