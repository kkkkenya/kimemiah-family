"use client";

// A light "something changed" ping between open phones (Supabase Realtime broadcast). The ping
// carries no data: phones that hear it just sync, so a co-shopper's tick or a kitchen handoff
// shows up in about a second instead of at the next 30-second round.
import { supabase } from "@/lib/supabase/client";

export function joinHousehold(onPing: () => void) {
  const channel = supabase()
    .channel("household-live")
    .on("broadcast", { event: "changed" }, () => onPing())
    .subscribe();
  return {
    ping: () => void channel.send({ type: "broadcast", event: "changed", payload: {} }),
    leave: () => void supabase().removeChannel(channel),
  };
}
