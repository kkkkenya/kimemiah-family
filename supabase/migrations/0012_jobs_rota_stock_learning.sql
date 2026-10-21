-- Jobs, round 2: a weekly sign-up grid for daily jobs, stock that creates jobs when it runs
-- low, real start times (so estimates learn), and the bookkeeping push alerts need.

-- ---------------------------------------------------------------- jobs

alter table public.jobs
  add column template_key text,              -- which usual job it came from, so its time can be learned
  add column started_at timestamptz,         -- "I'm starting"; done_at - started_at is the real time
  add column rota_date date,                 -- posted from the weekly grid for this day...
  add column rota_key text,                  -- ...and this chore
  add column source_item_id uuid references public.stock_items(id), -- created because this item ran low
  add column urgent_notified_at timestamptz, -- push bookkeeping (server only)
  add column covered_notified_at timestamptz,
  add column overdue_notified_at timestamptz;

create unique index jobs_one_rota_job on public.jobs (rota_date, rota_key) where rota_date is not null and deleted_at is null;

alter table public.job_participants add column last_reminded_at timestamptz;

-- ---------------------------------------------------------------- weekly sign-up grid

-- Agreed at the meeting: who does which daily job on which day (1 = Monday ... 7 = Sunday).
create table public.job_rota (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 1 and 7),
  chore text not null check (chore in ('dishes', 'cook', 'dog')),
  member_id uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create unique index job_rota_one_cell on public.job_rota (weekday, chore) where deleted_at is null;
create index job_rota_updated_at on public.job_rota (updated_at);
create trigger set_row_meta before insert or update on public.job_rota for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.job_rota for each row execute function public.write_audit();
alter table public.job_rota enable row level security;
grant select on public.job_rota to authenticated;
create policy household_read on public.job_rota for select to authenticated using (public.is_household());
grant insert (id, weekday, chore, member_id), update (weekday, chore, member_id, deleted_at) on public.job_rota to authenticated;
create policy household_insert on public.job_rota for insert to authenticated with check (public.is_household());
create policy household_update on public.job_rota for update to authenticated using (public.is_household()) with check (public.is_household());

-- The daily jobs the grid can hold. Times are Nairobi; due_hour is when it should be done.
create function public.rota_chores() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "dishes": {"title": "Wash dishes and pots", "category": "kitchen_dishes", "strain": "medium", "duration_min": 40, "due": "21:00", "template_key": "dishes"},
    "cook":   {"title": "Cook supper for the house", "category": "cooking_house", "strain": "medium", "duration_min": 90, "due": "19:30", "template_key": "cook"},
    "dog":    {"title": "Feed the dog and clean the kennel area", "category": "dogs_pets", "strain": "light", "duration_min": 15, "due": "18:00", "template_key": "feed"}
  }'::jsonb;
$$;

-- Post today's grid jobs, already taken by whoever signed up (unless they're away today).
-- Safe to call any number of times, from any phone or the scheduler.
create function public.ensure_rota_jobs() returns int
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Africa/Nairobi')::date;
  r record;
  c jsonb;
  new_id uuid;
  who_presence text;
  made int := 0;
begin
  if auth.uid() is not null and not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  for r in
    select g.chore, g.member_id from public.job_rota g
     where g.deleted_at is null and g.member_id is not null and g.weekday = extract(isodow from today)::int
  loop
    c := public.rota_chores() -> r.chore;
    if exists (select 1 from public.jobs j where j.rota_date = today and j.rota_key = r.chore and j.deleted_at is null) then
      continue;
    end if;
    select presence into who_presence from public.members where id = r.member_id;
    insert into public.jobs (title, notes, category, strain, duration_min, people_needed, due_at, template_key, rota_date, rota_key)
    values (c->>'title',
            case when who_presence = 'away' then (select name from public.members where id = r.member_id) || ' is away today. Can someone take it?' end,
            c->>'category', c->>'strain', (c->>'duration_min')::int, 1,
            (today + (c->>'due')::time) at time zone 'Africa/Nairobi', c->>'template_key', today, r.chore)
    returning id into new_id;
    if who_presence is distinct from 'away' then
      insert into public.job_participants (job_id, member_id, effort_pct, role_note) values (new_id, r.member_id, 100, 'From the weekly grid');
    end if;
    made := made + 1;
  end loop;
  return made;
end;
$$;

-- ---------------------------------------------------------------- stock that creates jobs

-- What to post when an item runs low: {"on": "low"|"out", "title", "category", "strain",
-- "duration_min", "people_needed", "requires_funds", "days_ahead", "template_key"}.
alter table public.stock_items add column restock_job jsonb;

update public.stock_items set restock_job = '{"on": "out", "title": "Refill the cooking gas cylinder", "category": "shopping_errand", "strain": "heavy", "duration_min": 60, "people_needed": 2, "requires_funds": true, "days_ahead": 0, "template_key": "gas"}'
 where name = 'Cooking gas' and deleted_at is null;
update public.stock_items set restock_job = '{"on": "low", "title": "Vet run: dog unga", "category": "shopping_errand", "strain": "medium", "duration_min": 60, "people_needed": 1, "requires_funds": true, "days_ahead": 1, "template_key": "vet"}'
 where name = 'Dog unga' and deleted_at is null;
update public.stock_items set restock_job = '{"on": "low", "title": "Ask Peter for KPLC tokens", "category": "utilities_dad", "strain": "light", "duration_min": 10, "people_needed": 1, "template_key": "tokens"}'
 where name = 'KPLC tokens' and deleted_at is null;

create function public.stock_level(s public.stock_items) returns text
language sql immutable set search_path = '' as $$
  select case
    when s.track_mode = 'level' then s.level
    when s.min_qty > 0 and s.have_qty <= 0 then 'out'
    when s.min_qty > 0 and s.have_qty <= s.min_qty then 'low'
    else 'ok' end;
$$;

create function public.stock_restock_job() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t jsonb := new.restock_job;
  was text := public.stock_level(old);
  now_ text := public.stock_level(new);
  hit boolean;
  planned date;
begin
  if t is null or now_ = was then return null; end if;
  hit := case when t->>'on' = 'out' then now_ = 'out' else now_ in ('low', 'out') and was = 'ok' end;
  -- Starter rows nobody has counted yet (actor_id null) don't count as running out.
  if not hit or new.actor_id is null then return null; end if;
  if exists (select 1 from public.jobs j where j.source_item_id = new.id and j.done_at is null and j.deleted_at is null) then
    return null;
  end if;
  planned := (now() at time zone 'Africa/Nairobi')::date + coalesce((t->>'days_ahead')::int, 0);
  insert into public.jobs (title, notes, category, strain, duration_min, people_needed, urgent, due_at, template_key,
                           requires_funds, funds_status, planned_for, source_item_id)
  values (t->>'title', new.name || ' is ' || now_ || '.', t->>'category', coalesce(t->>'strain', 'medium'),
          coalesce((t->>'duration_min')::int, 30), coalesce((t->>'people_needed')::int, 1), now_ = 'out',
          (planned + time '21:00') at time zone 'Africa/Nairobi', t->>'template_key',
          coalesce((t->>'requires_funds')::boolean, false),
          case when coalesce((t->>'requires_funds')::boolean, false) then 'discussing' else 'not_needed' end,
          case when coalesce((t->>'requires_funds')::boolean, false) then planned end, new.id);
  return null;
end;
$$;

create trigger stock_restock_job after update on public.stock_items
  for each row execute function public.stock_restock_job();

-- ---------------------------------------------------------------- push subscriptions

-- Each phone saves its own push address (or turns alerts off).
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_enabled boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (device_id, endpoint, p256dh, auth, enabled)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_enabled)
  on conflict (endpoint) do update set device_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
    enabled = excluded.enabled, deleted_at = null;
end;
$$;

-- ---------------------------------------------------------------- what phones may change

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "members":          {"insert_only": false, "cols": ["id","presence"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","for_meal_slot_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for","template_key","started_at"]},
    "job_rota":         {"insert_only": false, "cols": ["id","weekday","chore","member_id"]},
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

grant insert (template_key, started_at), update (template_key, started_at) on public.jobs to authenticated;

revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
revoke execute on function public.stock_restock_job(), public.stock_level(public.stock_items) from authenticated, anon, public;
revoke execute on function public.ensure_rota_jobs(), public.rota_chores(), public.save_push_subscription(text, text, text, boolean) from public, anon;
grant execute on function public.ensure_rota_jobs(), public.rota_chores(), public.save_push_subscription(text, text, text, boolean) to authenticated;
