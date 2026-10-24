// House alerts beyond jobs and money: someone asks you to swap a job (once, to you), someone has
// just started a shopping trip (once, to everyone else at home, so they can add to the list), and
// the family meeting (the host the evening before; everyone, Peter too, in the hour before).
import { isQuiet } from "./plan";
import type { MoneyAlert } from "./money";

export type Swap = { id: string; job_id: string; to_member: string; offer_job_id?: string | null; note?: string | null; status: string; actor_id?: string | null; deleted_at?: string | null };
export type Trip = { id: string; shop_id?: string | null; member_id?: string | null; started_at?: string | null; finished_at?: string | null; deleted_at?: string | null };
type Person = { id: string; name: string; active?: boolean; is_remote?: boolean; presence?: string | null };
type JobLite = { id: string; title: string; done_at?: string | null; deleted_at?: string | null };
export type MeetingLite = { id: string; held_on: string | null; host_id: string | null; status: string; start_time?: string | null; deleted_at?: string | null };

const RECENT_TRIP = 15 * 60_000;

export function planHouseAlerts(swaps: Swap[], trips: Trip[], jobs: JobLite[], shops: { id: string; name: string }[], people: Person[], now: number, meetings: MeetingLite[] = [], agendaCount: (meetingId: string) => number = () => 0): MoneyAlert[] {
  if (isQuiet(now)) return [];
  const out: MoneyAlert[] = [];
  const nameOf = (id?: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";
  const titleOf = (id?: string | null) => jobs.find((j) => j.id === id)?.title ?? "a job";

  for (const s of swaps) {
    if (s.deleted_at || s.status !== "open") continue;
    const job = jobs.find((j) => j.id === s.job_id);
    if (!job || job.done_at || job.deleted_at) continue;
    out.push({
      key: `swap:${s.id}`,
      kind: "handover",
      to: [s.to_member],
      url: "/jobs",
      title: `${nameOf(s.actor_id)} asks: can you take "${job.title}"?`,
      body: s.offer_job_id ? `In return they'll take your "${titleOf(s.offer_job_id)}". Accept or say no in Jobs.` : (s.note ?? "Accept or say no in Jobs."),
    });
  }

  for (const t of trips) {
    if (t.deleted_at || t.finished_at || !t.started_at) continue;
    if (now - Date.parse(t.started_at) > RECENT_TRIP) continue;
    const home = people.filter((p) => p.active !== false && !p.is_remote && p.id !== t.member_id && (p.presence ?? "at_home") === "at_home").map((p) => p.id);
    if (!home.length) continue;
    const shop = shops.find((s) => s.id === t.shop_id)?.name ?? "the shops";
    out.push({
      key: `trip:${t.id}`,
      kind: "funds",
      to: home,
      url: "/shop",
      title: `${nameOf(t.member_id)} is at ${shop}`,
      body: "Need anything? Add it to the list now and it shows up in their aisle.",
    });
  }
  const nairobi = new Date(now + 3 * 3600_000);
  const today = nairobi.toISOString().slice(0, 10);
  const tomorrow = new Date(now + 27 * 3600_000).toISOString().slice(0, 10);
  const everyone = people.filter((p) => p.active !== false).map((p) => p.id);
  for (const m of meetings) {
    if (m.deleted_at || m.status !== "planned" || !m.held_on) continue;
    const items = agendaCount(m.id);
    if (m.held_on === tomorrow && nairobi.getUTCHours() >= 18 && m.host_id) {
      out.push({
        key: `meet-host:${m.id}`,
        kind: "funds",
        to: [m.host_id],
        url: "/more/meeting",
        title: "You're hosting the family meeting tomorrow",
        body: `${m.start_time ?? "17:00"}, ${items ? `${items} on the agenda` : "the agenda is still empty"}. Have a look tonight.`,
      });
    }
    const start = Date.parse(`${m.held_on}T${m.start_time ?? "17:00"}:00+03:00`);
    if (m.held_on === today && start - now <= 60 * 60_000 && start - now > 0) {
      out.push({
        key: `meet-soon:${m.id}`,
        kind: "funds",
        to: everyone,
        url: "/more/meeting",
        title: `Family meeting at ${m.start_time ?? "17:00"}`,
        body: `${items ? `${items} on the agenda. ` : ""}Bring anything you want to raise.`,
      });
    }
  }
  return out;
}
