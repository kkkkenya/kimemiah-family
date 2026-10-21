import "server-only";
import webpush from "web-push";
import { groupByPerson, planAlerts, type Alert, type PushJob, type PushMember, type PushPart } from "@/lib/push/plan";
import { adminClient } from "./supabase-admin";

const APP_URL = "https://kimemiah-family.vercel.app";

function vapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("Missing VAPID keys. Run: npm run setup");
  webpush.setVapidDetails(APP_URL, pub, priv);
}

type Db = ReturnType<typeof adminClient>;

// Mark an alert as handled before sending, with a condition, so two ticks never send it twice.
async function claim(db: Db, a: Alert, now: string): Promise<boolean> {
  const twoHoursAgo = new Date(Date.parse(now) - 2 * 3600_000).toISOString();
  const weekAgo = new Date(Date.parse(now) - 7 * 86400_000).toISOString();
  const q = (table: string, col: string, id: string) => db.from(table).update({ [col]: now }).eq("id", id);
  let res;
  switch (a.kind) {
    case "urgent":
      res = await q("jobs", "urgent_notified_at", a.jobId!).is("urgent_notified_at", null).select("id");
      break;
    case "suggested":
      res = await q("jobs", "suggested_notified_at", a.jobId!).is("suggested_notified_at", null).select("id");
      break;
    case "nudge":
      res = await q("members", "nudged_at", a.memberId!).or(`nudged_at.is.null,nudged_at.lte.${weekAgo}`).select("id");
      break;
    case "ease":
      res = await q("members", "ease_offered_at", a.memberId!).or(`ease_offered_at.is.null,ease_offered_at.lte.${weekAgo}`).select("id");
      break;
    case "covered":
      res = await q("jobs", "covered_notified_at", a.jobId!).is("covered_notified_at", null).select("id");
      break;
    case "overdue":
      res = await q("jobs", "overdue_notified_at", a.jobId!).is("overdue_notified_at", null).select("id");
      break;
    case "reminder":
      res = await q("job_participants", "last_reminded_at", a.partId!).or(`last_reminded_at.is.null,last_reminded_at.lte.${twoHoursAgo}`).select("id");
      break;
    case "handover":
      res = await q("job_participants", "handover_notified_at", a.partId!).is("handover_notified_at", null).select("id");
      break;
  }
  return !res.error && (res.data?.length ?? 0) > 0;
}

/** One round: post today's weekly-grid jobs, work out who needs an alert, send them. */
export async function runTick(now = new Date()) {
  vapid();
  const db = adminClient();
  const iso = now.toISOString();
  await db.rpc("ensure_rota_jobs");

  const { data: settings } = await db.from("settings").select("push_kill_switch").limit(1).maybeSingle();
  if (settings?.push_kill_switch) return { alerts: 0, sent: 0, paused: true };

  const { data: jobs } = await db.from("jobs").select("*").is("done_at", null).is("deleted_at", null);
  // The last 2 weeks of finished jobs, to compare how much each person has given.
  const since = new Date(now.getTime() - 14 * 86400_000).toISOString();
  const { data: history } = await db.from("jobs").select("*").gte("done_at", since).is("deleted_at", null);
  const ids = [...(jobs ?? []), ...(history ?? [])].map((j) => j.id);
  const { data: parts } = ids.length ? await db.from("job_participants").select("*").in("job_id", ids) : { data: [] };
  const { data: members } = await db
    .from("members")
    .select("id, name, sort, active, presence, is_remote, no_heavy, ease_until, ease_offered_at, nudged_at")
    .eq("active", true);

  const alerts = planAlerts((jobs ?? []) as PushJob[], (parts ?? []) as PushPart[], (members ?? []) as PushMember[], now.getTime(), (history ?? []) as PushJob[]);
  const claimed: Alert[] = [];
  for (const a of alerts) if (await claim(db, a, iso)) claimed.push(a);

  const perPerson = groupByPerson(claimed);
  if (!perPerson.size) return { alerts: claimed.length, sent: 0 };

  const { data: devices } = await db.from("devices").select("id, member_id").in("member_id", [...perPerson.keys()]).is("revoked_at", null);
  const memberOf = new Map((devices ?? []).map((d) => [d.id, d.member_id as string]));
  const { data: subs } = memberOf.size
    ? await db.from("push_subscriptions").select("id, device_id, endpoint, p256dh, auth").in("device_id", [...memberOf.keys()]).eq("enabled", true).is("deleted_at", null)
    : { data: [] };

  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      const msg = perPerson.get(memberOf.get(s.device_id)!);
      if (!msg) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 3600, urgency: msg.tag.startsWith("urgent") ? "high" : "normal" },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // The phone uninstalled the app or turned alerts off: forget that address.
        if (code === 404 || code === 410) await db.from("push_subscriptions").update({ deleted_at: iso }).eq("id", s.id);
      }
    }),
  );
  return { alerts: claimed.length, sent };
}
