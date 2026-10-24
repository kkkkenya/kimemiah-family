"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSync } from "@/components/SyncProvider";
import { DecisionForm, FollowUps, WhosHere } from "@/components/meeting/parts";
import { whatsappHref } from "@/lib/contacts";
import { dayPlus } from "@/lib/jobs/actions";
import { weekAhead } from "@/lib/jobs/board";
import { formatMinutes, forAgenda, type Job, type Participant } from "@/lib/jobs/logic";
import { followUps, meetingSummary, type DecisionRow, type MeetingRow } from "@/lib/meeting";
import type { Bill } from "@/lib/money/bills";
import type { Kind } from "@/lib/money/flex";
import type { Budget, Entry, Project } from "@/lib/money/money";
import { monthlyReview } from "@/lib/money/review";
import { kes } from "@/lib/shopping/pricing";
import { syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";
import type { Row, SyncTable } from "@/lib/sync/tables";

type Meeting = Row & MeetingRow;
type Agenda = Row & { meeting_id: string; title: string; minutes: number | null; source: string; source_job_id: string | null; sort: number };
type Decision = Row & DecisionRow;
type Member = Row & { name: string; is_remote?: boolean; active?: boolean; sort: number; phone?: string | null };
type Thanks = Row & { to_member: string; message?: string | null; actor_id?: string | null; created_at?: string };
type Slide = { id: string; label: string; minutes: number | null; kind: "welcome" | "followups" | "item" | "wrap"; item?: Agenda };

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const lastMonth = () => {
  const d = new Date(`${today().slice(0, 7)}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

// Meeting mode: the agenda one item at a time, full screen and in large type, for the laptop
// on the TV. Each item brings what it's about (the money review, the week of jobs, thank-yous),
// with a timer against its planned minutes. Arrow keys move on; Esc goes back.
export default function MeetingMode() {
  const router = useRouter();
  const { syncNow } = useSync();
  const meetings = (useRows<Meeting>("meetings") ?? []).filter((m) => !m.deleted_at);
  const agenda = (useRows<Agenda>("agenda_items") ?? []).filter((a) => !a.deleted_at);
  const decisions = (useRows<Decision>("decisions") ?? []).filter((d) => !d.deleted_at);
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const members = ((useRows<Member>("members") ?? []) as Member[]).filter((m) => m.active !== false).sort((a, b) => a.sort - b.sort);
  const thanks = (useRows<Thanks>("thanks") ?? []) as Thanks[];
  const settings = (useRows<Row & { ground_rules?: string[]; volunteer_after_days?: number }>("settings") ?? [])[0];
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const kinds = (useRows<Kind & { id: string }>("budget_categories") ?? []) as Kind[];
  const budgets = (useRows<Budget & { id: string }>("budgets") ?? []) as Budget[];
  const bills = (useRows<Bill & { id: string }>("bills") ?? []) as Bill[];
  const projects = (useRows<Project & { id: string }>("projects") ?? []) as Project[];
  const reviews = (useRows<{ id: string; status: string; deleted_at?: string | null }>("entry_reviews") ?? []) as { status: string; deleted_at?: string | null }[];

  const next = meetings.filter((m) => m.status === "planned").sort((a, b) => (a.held_on ?? "").localeCompare(b.held_on ?? ""))[0];
  const items = next ? agenda.filter((a) => a.meeting_id === next.id).sort((a, b) => a.sort - b.sort) : [];
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";
  const followed = followUps(meetings, decisions, jobs, today());
  const peter = members.find((m) => m.is_remote);

  // The usual "Welcome and ground rules" item is the Welcome slide itself (with its minutes).
  const welcomeItem = items.find((a) => /welcome|ground rules/i.test(a.title));
  const slides: Slide[] = [
    { id: "welcome", label: "Welcome", minutes: welcomeItem?.minutes ?? null, kind: "welcome" },
    { id: "followups", label: "Last time we decided", minutes: null, kind: "followups" },
    ...items.filter((a) => a !== welcomeItem).map((a) => ({ id: a.id, label: a.title, minutes: a.minutes, kind: "item" as const, item: a })),
    { id: "wrap", label: "Wrap up", minutes: null, kind: "wrap" },
  ];
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [slideAt, setSlideAt] = useState(Date.now());
  const [done, setDone] = useState(false);
  const slide = slides[Math.min(at, slides.length - 1)];

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // The meeting clock survives a reload of the page.
  useEffect(() => {
    if (!next) return;
    const key = `meeting.started.${next.id}`;
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (saved) return setStartedAt(saved);
      const t = Date.now();
      sessionStorage.setItem(key, String(t));
      setStartedAt(t);
    } catch {
      setStartedAt(Date.now());
    }
  }, [next?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per meeting
  useEffect(() => {
    const go = (by: number) => {
      setAt((i) => Math.max(0, Math.min(slides.length - 1, i + by)));
      setSlideAt(Date.now());
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      if (e.key === "Escape") router.push("/more/meeting");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, router]);

  const change = async (table: SyncTable, op: "insert" | "update", row: Row) => {
    await syncEngine().queue(table, op, row);
    void syncNow();
  };
  const move = (by: number) => {
    setAt((i) => Math.max(0, Math.min(slides.length - 1, i + by)));
    setSlideAt(Date.now());
  };

  if (!next) {
    return (
      <div className="monarch fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-base p-6 text-center">
        <p className="font-display text-3xl">No meeting is planned.</p>
        <Link href="/more/meeting" className="min-h-12 rounded-xl bg-brand px-6 py-3 font-bold text-brand-contrast">
          Plan one
        </Link>
      </div>
    );
  }

  const here = next.attendees ?? [];
  const slideMs = now - slideAt;
  const planned = (slide.minutes ?? 0) * 60_000;
  const over = planned > 0 && slideMs > planned;
  // "Money review: October 2026" reviews October; otherwise last month.
  const named = slide.label.match(/([A-Za-z]+) (\d{4})\s*$/);
  const parsed = named ? new Date(`1 ${named[1]} ${named[2]} 12:00 UTC`) : null;
  const reviewMonth = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 7) : lastMonth();
  const review = monthlyReview(reviewMonth, { entries, kinds, budgets, bills, projects, reviews, nameOf: (id) => nameOf(id) });
  const title = slide.label;
  const lower = title.toLowerCase();

  let body: ReactNode = null;
  if (slide.kind === "welcome") {
    body = (
      <div className="flex flex-col gap-6">
        <div>
          <p className="eyebrow mb-3">Who&apos;s here</p>
          <WhosHere big people={members} here={here} onChange={(ids) => change("meetings", "update", { id: next.id, attendees: ids })} />
        </div>
        {settings?.ground_rules?.length ? (
          <div>
            <p className="eyebrow mb-2">Ground rules</p>
            <ol className="list-decimal pl-6 text-xl leading-relaxed lg:text-2xl">
              {settings.ground_rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    );
  } else if (slide.kind === "followups") {
    body = <FollowUps big items={followed} nameOf={nameOf} onDone={(d) => change("decisions", "update", { id: d.id, done_at: new Date().toISOString() })} />;
  } else if (slide.kind === "wrap") {
    const mine = decisions.filter((d) => d.meeting_id === next.id);
    const text = meetingSummary({ ...next, status: "held" }, decisions, (id) => nameOf(id), followed);
    body = done ? (
      <div className="flex flex-col gap-4">
        <p className="font-display text-3xl">Meeting saved. Asante, everyone.</p>
        <a href={whatsappHref(peter?.phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-center rounded-xl bg-brand px-6 text-lg font-bold text-brand-contrast lg:self-start">
          Send the summary to {peter?.name.split(" ")[0] ?? "Peter"} on WhatsApp
        </a>
        <Link href="/more/meeting" className="text-lg font-bold underline underline-offset-4">
          Back to the meeting page
        </Link>
      </div>
    ) : (
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Decided today ({mine.length})</p>
          <ul className="flex flex-col gap-2 text-xl">
            {mine.map((d) => (
              <li key={d.id}>
                {d.text}
                <span className="text-[1rem] text-muted"> · {d.owner_id ? nameOf(d.owner_id) : "nobody named"}</span>
              </li>
            ))}
            {!mine.length && <li className="text-muted">Nothing decided yet.</li>}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Anything else to decide?</p>
          <DecisionForm people={members} onSave={(d) => change("decisions", "insert", { id: crypto.randomUUID(), meeting_id: next.id, decided_on: dayPlus(0), job_id: null, done_at: null, ...d })} />
          <button
            type="button"
            onClick={async () => {
              await change("meetings", "update", { id: next.id, status: "held" });
              const twoWeeksOn = new Date(Date.parse(`${next.held_on ?? dayPlus(0)}T09:00:00Z`) + 14 * 86400_000).toISOString().slice(0, 10);
              const host = members.filter((m) => !m.is_remote);
              const i = host.findIndex((m) => m.id === next.host_id);
              await change("meetings", "insert", { id: crypto.randomUUID(), held_on: twoWeeksOn > dayPlus(0) ? twoWeeksOn : dayPlus(14), host_id: host[(i + 1) % Math.max(1, host.length)]?.id ?? null, notes: null, status: "planned", attendees: [], start_time: next.start_time ?? "17:00" });
              setDone(true);
            }}
            className="min-h-14 rounded-xl border-2 border-ink text-lg font-bold"
          >
            We&apos;ve had the meeting
          </button>
        </div>
      </div>
    );
  } else if (slide.item?.source === "money_review" || /money/.test(lower)) {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="grid grid-cols-3 gap-3 tabular">
          <Stat label="In" value={kes(review.moneyIn)} />
          <Stat label="Spent" value={kes(review.moneyOut)} />
          <Stat label="Kept" value={review.keptPct === null ? "–" : `${review.keptPct}%`} />
        </dl>
        <ul className="flex flex-col gap-2 text-xl">
          {review.topKinds.map((k) => (
            <li key={k.name} className="flex justify-between gap-3">
              <span>{k.name}</span>
              <span className={`tabular ${k.over ? "font-bold text-out-strong" : ""}`}>
                {kes(k.spent)}
                {k.plan ? <span className="text-[1rem] text-muted"> / {kes(k.plan)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/money/review?month=${reviewMonth}`} className="text-lg font-bold underline underline-offset-4">
          Open the full review
        </Link>
      </div>
    );
  } else if (/apprec|thank|asante/.test(lower)) {
    body = <Appreciation members={members} thanks={thanks} nameOf={nameOf} onThank={(to, message) => change("thanks", "insert", { id: crypto.randomUUID(), target_type: "other", target_id: null, to_member: to, message })} />;
  } else if (/job|rota|sign-up/.test(lower) || slide.item?.source === "waiting_job") {
    const week = weekAhead(jobs, parts, today());
    const waiting = forAgenda(jobs, parts, settings?.volunteer_after_days ?? 3);
    body = (
      <div className="flex flex-col gap-4">
        {waiting.length > 0 && (
          <p className="rounded-xl bg-low-bg p-3 text-lg text-low-fg">
            Waiting for someone: <strong>{waiting.map((j) => j.title).join(", ")}</strong>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {week.map((d, i) => (
            <div key={d.day} className="flex flex-col gap-1.5 rounded-xl bg-raised p-3">
              <p className="flex justify-between font-bold">
                {i === 0 ? "Today" : new Date(`${d.day}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric" })}
                <span className="text-xs font-normal text-muted">{d.minutes ? formatMinutes(d.minutes) : ""}</span>
              </p>
              {d.jobs.map(({ job, people }) => (
                <p key={job.id} className="text-sm leading-snug">
                  {job.title}
                  <span className={`block text-xs ${people.length ? "text-muted" : "font-bold text-action-text"}`}>{people.length ? people.map((p) => nameOf(p).split(" ")[0]).join(", ") : "Nobody yet"}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  } else if (/decision/.test(lower) || slide.item?.source === "flag") {
    body = (
      <div className="flex flex-col gap-3 lg:max-w-2xl">
        {slide.item?.source === "flag" && <p className="text-xl text-muted">A question raised during the week.</p>}
        <DecisionForm people={members} onSave={(d) => change("decisions", "insert", { id: crypto.randomUUID(), meeting_id: next.id, decided_on: dayPlus(0), job_id: null, done_at: null, ...d })} />
      </div>
    );
  } else {
    body = <Notes meeting={next} onSave={(notes) => change("meetings", "update", { id: next.id, notes })} />;
  }

  return (
    <div className="monarch fixed inset-0 z-40 flex flex-col bg-base pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-raised px-4 py-3 lg:px-10">
        <p className="min-w-0 truncate">
          <span className="font-display text-xl">Family meeting</span>
          <span className="ml-2 text-sm text-muted">
            {nameOf(next.host_id)} hosting · {here.length} here
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-3">
          <span className="font-display text-2xl tabular" aria-label="Time so far">
            {startedAt ? clock(now - startedAt) : "0:00"}
          </span>
          <Link href="/more/meeting" aria-label="Leave meeting mode" className="flex size-11 items-center justify-center rounded-xl border border-line">
            ✕
          </Link>
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-10 lg:py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div>
            <p className="eyebrow eyebrow-accent">
              {at + 1} of {slides.length}
              {slide.minutes ? ` · ${slide.minutes} min` : ""}
            </p>
            <h1 className="font-display text-4xl leading-tight lg:text-6xl">{title}</h1>
            {planned > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div className={`h-full rounded-full ${over ? "bg-out-strong" : "bg-action"}`} style={{ width: `${Math.min(100, (slideMs / planned) * 100)}%` }} />
                </div>
                <span className={`tabular ${over ? "font-bold text-out-strong" : "text-muted"}`}>
                  {clock(slideMs)} of {slide.minutes}:00
                </span>
              </div>
            )}
          </div>
          {body}
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-line bg-raised px-4 py-3 lg:px-10">
        <button type="button" onClick={() => move(-1)} disabled={at === 0} className="min-h-12 rounded-xl border border-line px-5 font-bold disabled:opacity-30">
          ‹ Back
        </button>
        <div className="hidden gap-1.5 sm:flex" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.id} className={`h-2 rounded-full ${i === at ? "w-6 bg-action" : i < at ? "w-2 bg-ink" : "w-2 bg-line"}`} />
          ))}
        </div>
        <button type="button" onClick={() => move(1)} disabled={at === slides.length - 1} className="min-h-12 rounded-xl bg-brand px-6 font-bold text-brand-contrast disabled:opacity-30">
          {at === slides.length - 2 ? "Wrap up ›" : "Next ›"}
        </button>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-raised p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-display text-3xl">{value}</dd>
    </div>
  );
}

function Notes({ meeting, onSave }: { meeting: Meeting; onSave: (notes: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-2 lg:max-w-3xl">
      <span className="eyebrow">Notes</span>
      <textarea
        rows={6}
        value={v ?? meeting.notes ?? ""}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== null && v !== (meeting.notes ?? "") && onSave(v)}
        placeholder="What came up, in a few words"
        className="w-full rounded-xl border border-line bg-raised p-4 text-lg"
      />
    </label>
  );
}

/** The appreciation round: recent thank-yous, and a quick way to give one now. */
function Appreciation({ members, thanks, nameOf, onThank }: { members: Member[]; thanks: Thanks[]; nameOf: (id: string | null) => string; onThank: (to: string, message: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const recent = thanks.filter((t) => !t.deleted_at && t.created_at && Date.now() - Date.parse(t.created_at) < 14 * 86_400_000).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-2">Asante in the last 2 weeks ({recent.length})</p>
        <ul className="flex flex-col gap-2 text-lg">
          {recent.slice(0, 8).map((t) => (
            <li key={t.id}>
              💛 <strong>{nameOf(t.to_member).split(" ")[0]}</strong>
              {t.message ? <span className="text-muted"> · {t.message}</span> : null}
            </li>
          ))}
          {!recent.length && <li className="text-muted">None yet. Start the round.</li>}
        </ul>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!to) return;
          onThank(to, `${from ? `${nameOf(from).split(" ")[0]}: ` : ""}${why.trim() || "Asante!"}`);
          setWhy("");
          setTo("");
        }}
        className="flex flex-col gap-2"
      >
        <p className="eyebrow">Give an Asante now</p>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-12 rounded-xl border border-line bg-raised px-3">
            <option value="">From…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-12 rounded-xl border border-line bg-raised px-3">
            <option value="">To…</option>
            {members
              .filter((m) => m.id !== from)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For… (e.g. cooking every night this week)" className="min-h-12 rounded-xl border border-line bg-raised px-3" />
        <button type="submit" disabled={!to} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Send Asante 💛
        </button>
      </form>
    </div>
  );
}
