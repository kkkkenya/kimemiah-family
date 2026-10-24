import "server-only";
import webpush from "web-push";
import { planHouseAlerts, type MeetingLite, type Swap, type Trip } from "@/lib/push/house";
import { planMoneyAlerts, type Review } from "@/lib/push/money";
import { groupByPerson, planAlerts, type Alert, type PushJob, type PushMember, type PushPart } from "@/lib/push/plan";
import type { Kind } from "@/lib/money/flex";
import type { Budget, Entry } from "@/lib/money/money";
import type { Bill } from "@/lib/money/bills";
import { actionsOf, typeOf } from "@/lib/push/style";
import { ensureBillJobs } from "./bills";
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
    case "funds":
      res = await q("jobs", "funds_notified_at", a.jobId!).is("funds_notified_at", null).select("id");
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
  await ensureBillJobs(db, now);

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
    .select("id, name, sort, active, presence, is_remote, no_heavy, ease_until, ease_offered_at, nudged_at, alert_amounts")
    .eq("active", true);

  const alerts = planAlerts((jobs ?? []) as PushJob[], (parts ?? []) as PushPart[], (members ?? []) as PushMember[], now.getTime(), (history ?? []) as PushJob[]);
  const claimed: Alert[] = [];
  for (const a of alerts) if (await claim(db, a, iso)) claimed.push(a);

  // Money: budgets at 80% / 100% and questions about an entry, each recorded once by its key.
  const yearAgo = new Date(now.getTime() - 400 * 86400_000).toISOString().slice(0, 10);
  const [{ data: kinds }, { data: budgets }, { data: entries }, { data: reviews }] = await Promise.all([
    db.from("budget_categories").select("id, name, sort, rollover, budget_group, deleted_at").is("deleted_at", null),
    db.from("budgets").select("category_id, month, amount_kes").is("deleted_at", null),
    db.from("money_entries").select("id, direction, occurred_on, amount_kes, category_id, project_id, voids_entry_id, note, counterparty, bill_id, usage_qty, payback_to, deleted_at").gte("occurred_on", yearAgo),
    db.from("entry_reviews").select("id, entry_id, ask_to, question, status, actor_id, deleted_at").eq("status", "open").is("deleted_at", null),
  ]);
  const { data: billRows } = await db.from("bills").select("*").is("deleted_at", null);
  for (const a of planMoneyAlerts((kinds ?? []) as Kind[], (budgets ?? []) as Budget[], (entries ?? []) as Entry[], (reviews ?? []) as Review[], (members ?? []) as PushMember[], now.getTime(), (billRows ?? []) as Bill[])) {
    const { error } = await db.from("money_alerts").insert({ key: a.key, sent_at: iso });
    if (!error && a.to.length) claimed.push(a);
  }

  // Swap requests and "someone is at the shop", each sent once by its key.
  const tripSince = new Date(now.getTime() - 20 * 60_000).toISOString();
  const [{ data: swaps }, { data: trips }, { data: shops }, { data: meetings }, { data: agenda }] = await Promise.all([
    db.from("job_swaps").select("*").eq("status", "open").is("deleted_at", null),
    db.from("shopping_trips").select("id, shop_id, member_id, started_at, finished_at, deleted_at").gte("started_at", tripSince),
    db.from("shops").select("id, name"),
    db.from("meetings").select("id, held_on, host_id, status, start_time, deleted_at").eq("status", "planned").is("deleted_at", null),
    db.from("agenda_items").select("meeting_id").is("deleted_at", null),
  ]);
  const agendaCount = (id: string) => (agenda ?? []).filter((a) => a.meeting_id === id).length;
  for (const a of planHouseAlerts((swaps ?? []) as Swap[], (trips ?? []) as Trip[], (jobs ?? []) as { id: string; title: string }[], shops ?? [], (members ?? []) as PushMember[], now.getTime(), (meetings ?? []) as MeetingLite[], agendaCount)) {
    const { error } = await db.from("money_alerts").insert({ key: a.key, sent_at: iso });
    if (!error && a.to.length) claimed.push(a);
  }

  // Every alert is kept in the person's inbox (even on phones without push).
  const rows = claimed.flatMap((a) => a.to.map((m) => ({ member_id: m, type: typeOf(a), title: a.title, body: a.body, url: a.url ?? "/jobs", actions: actionsOf(a) })));
  if (rows.length) await db.from("notifications").insert(rows);

  const amounts = new Set((members ?? []).filter((m) => (m as { alert_amounts?: boolean }).alert_amounts).map((m) => m.id));
  const perPerson = groupByPerson(claimed, (m) => amounts.has(m));
  if (!perPerson.size) return { alerts: claimed.length, sent: 0 };
  const unread = await unreadCounts(db, [...perPerson.keys()]);

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
          JSON.stringify({ ...msg, badge: unread.get(memberOf.get(s.device_id)!) ?? 0 }),
          { TTL: 3600, urgency: msg.type === "urgent" || msg.type === "swap" ? "high" : "normal" },
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

/** How many unread notifications each person has (for the number on the app icon). */
async function unreadCounts(db: Db, members: string[]): Promise<Map<string, number>> {
  const { data } = await db.from("notifications").select("member_id").in("member_id", members).is("read_at", null).is("deleted_at", null);
  const out = new Map<string, number>();
  for (const r of data ?? []) out.set(r.member_id as string, (out.get(r.member_id as string) ?? 0) + 1);
  return out;
}

/** "Send me a test": one notification to this phone only, so setting up can be checked. */
export async function sendTest(deviceId: string, memberId: string): Promise<{ sent: number }> {
  vapid();
  const db = adminClient();
  const msg = { title: "Notifications work on this phone", body: "This is what an alert from Kimemiah Home looks like.", tag: "test", url: "/more/notifications", type: "test", actions: [] };
  await db.from("notifications").insert({ member_id: memberId, type: "test", title: msg.title, body: msg.body, url: msg.url, actions: [] });
  const badge = (await unreadCounts(db, [memberId])).get(memberId) ?? 0;
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("device_id", deviceId).eq("enabled", true).is("deleted_at", null);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg, badge }), { TTL: 600, urgency: "high" });
      sent++;
    } catch {}
  }
  return { sent };
}
