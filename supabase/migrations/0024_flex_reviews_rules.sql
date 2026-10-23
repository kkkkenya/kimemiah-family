-- Money, phase 1 of the Monarch MVP: flex budgeting (fixed, flexible, non-monthly), questions
-- about an entry for one person, M-Pesa rules that sort pasted messages, and a record of money
-- alerts so each one is sent once.

alter table public.budget_categories add column budget_group text not null default 'flexible'
  check (budget_group in ('fixed', 'flexible', 'non_monthly'));
grant insert (budget_group), update (budget_group) on public.budget_categories to authenticated;
update public.budget_categories set budget_group = 'non_monthly' where rollover;

alter table public.settings add column budget_style text not null default 'flex' check (budget_style in ('flex', 'category'));
grant update (budget_style) on public.settings to authenticated;

-- Internet is the family's one fixed cost: its own kind, and the Internet bill counts there.
insert into public.budget_categories (name, sort, budget_group)
select 'Internet', 5, 'fixed' where not exists (select 1 from public.budget_categories where name = 'Internet' and deleted_at is null);
update public.bills set category_id = (select id from public.budget_categories where name = 'Internet' and deleted_at is null limit 1)
where name = 'Internet' and deleted_at is null;

-- "Ask Wanini about this": a question on one entry, for one person (or anyone), answered with OK.
create table public.entry_reviews (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.money_entries(id),
  ask_to uuid references public.members(id),
  question text check (length(question) <= 200),
  status text not null default 'open' check (status in ('open', 'ok')),
  answer text check (length(answer) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create index entry_reviews_updated_at on public.entry_reviews (updated_at);
create trigger set_row_meta before insert or update on public.entry_reviews for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.entry_reviews for each row execute function public.write_audit();
alter table public.entry_reviews enable row level security;
grant select on public.entry_reviews to authenticated;
create policy household_read on public.entry_reviews for select to authenticated using (public.is_household());
grant insert (id, entry_id, ask_to, question, status, answer), update (ask_to, question, status, answer, deleted_at) on public.entry_reviews to authenticated;
create policy household_insert on public.entry_reviews for insert to authenticated with check (public.is_household());
create policy household_update on public.entry_reviews for update to authenticated using (public.is_household()) with check (public.is_household());

-- M-Pesa rules: when a pasted message's payee contains `match`, fill in kind, bill and shop.
create table public.money_rules (
  id uuid primary key default gen_random_uuid(),
  match text not null check (length(trim(match)) between 2 and 60),
  category_id uuid references public.budget_categories(id),
  bill_id uuid references public.bills(id),
  shop_id uuid references public.shops(id),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create index money_rules_updated_at on public.money_rules (updated_at);
create trigger set_row_meta before insert or update on public.money_rules for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.money_rules for each row execute function public.write_audit();
alter table public.money_rules enable row level security;
grant select on public.money_rules to authenticated;
create policy household_read on public.money_rules for select to authenticated using (public.is_household());
grant insert (id, match, category_id, bill_id, shop_id, sort), update (match, category_id, bill_id, shop_id, sort, deleted_at) on public.money_rules to authenticated;
create policy household_insert on public.money_rules for insert to authenticated with check (public.is_household());
create policy household_update on public.money_rules for update to authenticated using (public.is_household()) with check (public.is_household());

-- Server only: each money alert (budget at 80% / 100%, a question asked) is sent once.
create table public.money_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.money_alerts enable row level security;

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select (
    select a
    from (select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until","name","avatar","home_photo","eating_out_on","phone"]},
    "settings":         {"insert_only": false, "cols": ["id","volunteer_after_days","ground_rules","push_kill_switch","budget_style"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility","tool_location","tool_condition","last_used_by"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for","template_key","started_at"]},
    "job_rota":         {"insert_only": false, "cols": ["id","weekday","chore","member_id"]},
    "bills":            {"insert_only": false, "cols": ["id","name","category_id","usage_unit","every_days","usual_kes","note","sort"]},
    "entry_reviews":    {"insert_only": false, "cols": ["id","entry_id","ask_to","question","status","answer"]},
    "money_rules":      {"insert_only": false, "cols": ["id","match","category_id","bill_id","shop_id","sort"]},
    "projects":         {"insert_only": false, "cols": ["id","title","kind","target_kes","notes","job_id","status","target_date"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort","rollover","budget_group"]},
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
