-- Jobs (Phase 3): anyone posts a job with how long it takes and how many people it needs;
-- people join with an effort share (%) until it's covered; overdue jobs can be rescued.
-- Status (open / part-taken / taken / overdue / done) is worked out on the phone from these
-- facts, so it is right offline and needs no scheduled job.

-- ---------------------------------------------------------------- jobs

alter table public.jobs
  add column category text not null default 'house_cleaning' check (category in (
    'kitchen_dishes', 'cooking_house', 'compound_garden', 'water_tanks', 'dogs_pets',
    'house_cleaning', 'shopping_errand', 'utilities_dad', 'maintenance_fix')),
  -- How physically hard (Sister can't do heavy work). Size comes from duration x people.
  add column strain text not null default 'medium' check (strain in ('light', 'medium', 'heavy')),
  add column duration_min int not null default 30 check (duration_min between 5 and 1440),
  add column people_needed int not null default 1 check (people_needed between 1 and 4),
  add column urgent boolean not null default false,
  add column due_at timestamptz,
  -- Two-stage jobs: when this one is done, next_stage becomes a new job (e.g. arrange -> wash dishes).
  add column parent_job_id uuid references public.jobs(id),
  add column next_stage jsonb,
  -- Jobs that need money: posted 2-4 days ahead, two people go.
  add column requires_funds boolean not null default false,
  add column estimated_cost_kes numeric check (estimated_cost_kes > 0),
  add column funds_status text not null default 'not_needed'
    check (funds_status in ('not_needed', 'discussing', 'funds_ready', 'paid_by_dad')),
  add column planned_for date;

alter table public.jobs drop constraint jobs_repeat_check;
alter table public.jobs add constraint jobs_repeat_check
  check (repeat in ('none', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'when_low'));

create index jobs_open_due on public.jobs (due_at) where deleted_at is null and done_at is null;

-- ---------------------------------------------------------------- who is doing it

create table public.job_participants (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  member_id uuid not null references public.members(id),
  effort_pct int not null check (effort_pct between 5 and 100),
  role_note text,
  -- active: took part before it was due; rescuer: joined to rescue an overdue job;
  -- unable: was on it when someone took it over.
  status text not null default 'active' check (status in ('active', 'rescuer', 'unable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create unique index job_participants_one_each on public.job_participants (job_id, member_id) where deleted_at is null;
create index job_participants_updated_at on public.job_participants (updated_at);

create trigger set_row_meta before insert or update on public.job_participants
  for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.job_participants
  for each row execute function public.write_audit();

alter table public.job_participants enable row level security;
grant select on public.job_participants to authenticated;
create policy household_read on public.job_participants for select to authenticated using (public.is_household());
-- No insert/update grants: joining goes through the checked functions below (needs signal).

-- ---------------------------------------------------------------- joining (server checked, first come first served)

create function public.job_coverage(p_job uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(effort_pct), 0)::int from public.job_participants
   where job_id = p_job and deleted_at is null and status in ('active', 'rescuer');
$$;

-- Join a job, or change my share. Shares can't add up past 100%.
create function public.join_job(p_job uuid, p_pct int, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  j public.jobs;
  mine public.job_participants;
  others int;
  people int;
begin
  if me is null or not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job and deleted_at is null for update;
  if not found then raise exception 'that job no longer exists'; end if;
  if j.done_at is not null then raise exception 'that job is already done'; end if;
  if p_pct is null or p_pct < 5 or p_pct > 100 then raise exception 'pick a share between 5%% and 100%%'; end if;

  select * into mine from public.job_participants where job_id = p_job and member_id = me and deleted_at is null;
  select coalesce(sum(effort_pct), 0), count(*) into others, people from public.job_participants
   where job_id = p_job and deleted_at is null and status in ('active', 'rescuer') and member_id <> me;
  if others + p_pct > 100 then
    raise exception '%', format('only %s%% is left on this job', 100 - others);
  end if;
  if mine.id is null and people >= 4 then raise exception 'this job already has 4 people'; end if;

  if mine.id is null then
    insert into public.job_participants (job_id, member_id, effort_pct, role_note,
      status) values (p_job, me, p_pct, nullif(trim(p_note), ''),
      case when j.due_at is not null and j.due_at < now() then 'rescuer' else 'active' end)
    returning * into mine;
  else
    update public.job_participants set effort_pct = p_pct, role_note = coalesce(nullif(trim(p_note), ''), role_note)
     where id = mine.id returning * into mine;
  end if;
  return to_jsonb(mine);
end;
$$;

create function public.leave_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  row_ public.job_participants;
begin
  if me is null or not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  update public.job_participants set deleted_at = now()
   where job_id = p_job and member_id = me and deleted_at is null
     and exists (select 1 from public.jobs j where j.id = p_job and j.done_at is null)
  returning * into row_;
  if row_.id is null then raise exception 'you are not on this job'; end if;
  return to_jsonb(row_);
end;
$$;

-- An overdue job: help (take part of the remaining work, the others' shares shrink to fit)
-- or take over (the people who were on it step back; you take what's left).
create function public.rescue_job(p_job uuid, p_pct int, p_take_over boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  j public.jobs;
  mine public.job_participants;
  covered int;
  left_ int;
  originals int;
  scale numeric;
begin
  if me is null or not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job and deleted_at is null for update;
  if not found then raise exception 'that job no longer exists'; end if;
  if j.done_at is not null then raise exception 'that job is already done'; end if;

  -- Drop any earlier share of mine; I'm re-joining as a rescuer.
  update public.job_participants set deleted_at = now() where job_id = p_job and member_id = me and deleted_at is null;

  if p_take_over then
    update public.job_participants set status = 'unable'
     where job_id = p_job and deleted_at is null and status = 'active';
    left_ := 100 - public.job_coverage(p_job);
    if left_ < 5 then raise exception 'others are already finishing it'; end if;
    p_pct := left_;
  else
    if p_pct is null or p_pct < 5 or p_pct > 95 then raise exception 'pick a share between 5%% and 95%%'; end if;
    covered := public.job_coverage(p_job);
    if covered + p_pct > 100 then
      -- Make room: the people already on it keep the rest, in proportion.
      select coalesce(sum(effort_pct), 0) into originals from public.job_participants
       where job_id = p_job and deleted_at is null and status in ('active', 'rescuer');
      scale := (100 - p_pct)::numeric / originals;
      update public.job_participants set effort_pct = greatest(5, round(effort_pct * scale))
       where job_id = p_job and deleted_at is null and status in ('active', 'rescuer');
      p_pct := 100 - public.job_coverage(p_job);
    end if;
  end if;

  insert into public.job_participants (job_id, member_id, effort_pct, status)
  values (p_job, me, p_pct, 'rescuer') returning * into mine;
  return to_jsonb(mine);
end;
$$;

-- ---------------------------------------------------------------- when a job is done

-- Stage 2 of a two-stage job appears, and a repeating job comes back for its next date.
create function public.job_done_followups() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  step interval;
begin
  if old.done_at is not null or new.done_at is null then
    return null;
  end if;

  if new.next_stage is not null then
    insert into public.jobs (title, notes, category, strain, duration_min, people_needed, due_at, parent_job_id)
    values (
      coalesce(new.next_stage->>'title', 'Next step: ' || new.title),
      new.next_stage->>'notes',
      coalesce(new.next_stage->>'category', new.category),
      coalesce(new.next_stage->>'strain', 'medium'),
      coalesce((new.next_stage->>'duration_min')::int, new.duration_min),
      coalesce((new.next_stage->>'people_needed')::int, 1),
      greatest(coalesce(new.due_at, now()), now() + interval '3 hours'),
      new.id
    );
  end if;

  step := case new.repeat
    when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' end;
  if step is not null then
    insert into public.jobs (title, notes, category, strain, duration_min, people_needed, repeat, series_id,
                             due_at, next_stage, requires_funds, estimated_cost_kes, funds_status, planned_for)
    values (new.title, new.notes, new.category, new.strain, new.duration_min, new.people_needed, new.repeat,
            coalesce(new.series_id, new.id), coalesce(new.due_at, now()) + step, new.next_stage,
            new.requires_funds, new.estimated_cost_kes,
            case when new.requires_funds then 'discussing' else 'not_needed' end,
            new.planned_for + step);
  end if;
  return null;
end;
$$;

create trigger job_done_followups after update on public.jobs
  for each row execute function public.job_done_followups();

-- ---------------------------------------------------------------- what phones may change

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","for_meal_slot_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id"]},
    "budgets":          {"insert_only": false, "cols": ["id","month","category_id","amount_kes"]},
    "meetings":         {"insert_only": false, "cols": ["id","held_on","host_id","notes","status"]},
    "agenda_items":     {"insert_only": false, "cols": ["id","meeting_id","title","minutes","source","source_job_id","sort"]},
    "decisions":        {"insert_only": false, "cols": ["id","meeting_id","decided_on","text","job_id"]},
    "meals":            {"insert_only": false, "cols": ["id","name"]},
    "meal_ingredients": {"insert_only": false, "cols": ["id","meal_id","item_id","name","qty"]},
    "meal_slots":       {"insert_only": false, "cols": ["id","day","slot","meal_id","custom_name","everyone_out"]},
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb;
$$;

grant insert (category, strain, duration_min, people_needed, urgent, due_at, parent_job_id, next_stage,
              requires_funds, estimated_cost_kes, funds_status, planned_for),
      update (category, strain, duration_min, people_needed, urgent, due_at, parent_job_id, next_stage,
              requires_funds, estimated_cost_kes, funds_status, planned_for)
  on public.jobs to authenticated;

revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
revoke execute on function public.job_done_followups() from authenticated, anon, public;
revoke execute on function public.job_coverage(uuid), public.join_job(uuid, int, text), public.leave_job(uuid),
  public.rescue_job(uuid, int, boolean) from public, anon;
grant execute on function public.job_coverage(uuid), public.join_job(uuid, int, text), public.leave_job(uuid),
  public.rescue_job(uuid, int, boolean) to authenticated;
