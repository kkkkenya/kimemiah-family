-- Bills: water, gas, internet and the like. Each payment is a money entry tied to its bill, with
-- how much was bought (litres, kg, GB) so the app can show cost per unit, how long it lasted, and
-- when a month is heavier than usual. Paying a bill counts in that month's spending like any other.

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  category_id uuid references public.budget_categories(id),
  usage_unit text check (length(trim(usage_unit)) between 1 and 20),  -- litres, kg, GB; null = no usage to track
  every_days int check (every_days between 1 and 366),                 -- 30 = monthly; null = when it runs out
  usual_kes numeric check (usual_kes > 0),
  note text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create index bills_updated_at on public.bills (updated_at);
create trigger set_row_meta before insert or update on public.bills for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.bills for each row execute function public.write_audit();
alter table public.bills enable row level security;
grant select on public.bills to authenticated;
create policy household_read on public.bills for select to authenticated using (public.is_household());
grant insert (id, name, category_id, usage_unit, every_days, usual_kes, note, sort), update (name, category_id, usage_unit, every_days, usual_kes, note, sort, deleted_at) on public.bills to authenticated;
create policy household_insert on public.bills for insert to authenticated with check (public.is_household());
create policy household_update on public.bills for update to authenticated using (public.is_household()) with check (public.is_household());

alter table public.money_entries
  add column bill_id uuid references public.bills(id),
  add column usage_qty numeric check (usage_qty > 0);
grant insert (bill_id, usage_qty) on public.money_entries to authenticated;

-- A start: the bills most Nairobi homes have. The family edits, adds or removes them in the app.
insert into public.bills (name, category_id, usage_unit, every_days, sort)
select v.name, '00000000-0000-0000-0003-000000000005', v.unit, v.every, v.sort
from (values ('Water', 'litres', null::int, 1), ('Cooking gas', 'kg', null::int, 2), ('Internet', null, 30, 3)) as v(name, unit, every, sort)
where not exists (select 1 from public.bills);

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select (
    select a
    from (select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until","name","avatar","home_photo","eating_out_on","phone"]},
    "settings":         {"insert_only": false, "cols": ["id","volunteer_after_days","ground_rules","push_kill_switch"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility","tool_location","tool_condition","last_used_by"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for","template_key","started_at"]},
    "job_rota":         {"insert_only": false, "cols": ["id","weekday","chore","member_id"]},
    "bills":            {"insert_only": false, "cols": ["id","name","category_id","usage_unit","every_days","usual_kes","note","sort"]},
    "projects":         {"insert_only": false, "cols": ["id","title","kind","target_kes","notes","job_id","status"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id","project_id","mpesa_code","counterparty","bill_id","usage_qty"]},
    "budgets":          {"insert_only": false, "cols": ["id","month","category_id","amount_kes"]},
    "meetings":         {"insert_only": false, "cols": ["id","held_on","host_id","notes","status"]},
    "agenda_items":     {"insert_only": false, "cols": ["id","meeting_id","title","minutes","source","source_job_id","sort"]},
    "decisions":        {"insert_only": false, "cols": ["id","meeting_id","decided_on","text","job_id"]},
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb as a) x
  );
$$;
revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
