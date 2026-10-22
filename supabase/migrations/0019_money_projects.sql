-- Money (Phase 4): projects the family funds (house work and quality-of-life upgrades),
-- M-Pesa SMS codes so a pasted message is logged once, and the "money is ready" alert for runs.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 80),
  kind text not null check (kind in ('house_work', 'upgrade')),
  target_kes numeric not null check (target_kes > 0),
  notes text,
  job_id uuid references public.jobs(id),  -- house work: the job that unlocks once it's funded
  status text not null default 'saving' check (status in ('saving', 'funded', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create index projects_updated_at on public.projects (updated_at);
create trigger set_row_meta before insert or update on public.projects for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.projects for each row execute function public.write_audit();
alter table public.projects enable row level security;
grant select on public.projects to authenticated;
create policy household_read on public.projects for select to authenticated using (public.is_household());
grant insert (id, title, kind, target_kes, notes, job_id, status), update (title, kind, target_kes, notes, job_id, status, deleted_at) on public.projects to authenticated;
create policy household_insert on public.projects for insert to authenticated with check (public.is_household());
create policy household_update on public.projects for update to authenticated using (public.is_household()) with check (public.is_household());

-- Money given to a project is set aside (not shopping money); money spent on it says so too.
alter table public.money_entries
  add column project_id uuid references public.projects(id),
  add column mpesa_code text check (mpesa_code ~ '^[A-Z0-9]{8,12}$'),
  add column counterparty text;
create unique index money_entries_one_mpesa_code on public.money_entries (mpesa_code) where mpesa_code is not null;
grant insert (project_id, mpesa_code, counterparty) on public.money_entries to authenticated;

alter table public.jobs add column funds_notified_at timestamptz; -- server only: "money is ready" alert sent

insert into public.budget_categories (name, sort)
select v.name, v.sort from (values ('Dog', 7), ('House projects', 8), ('Upgrades', 9)) as v(name, sort)
where not exists (select 1 from public.budget_categories c where c.name = v.name and c.deleted_at is null);

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until","name","avatar","home_photo","eating_out_on"]},
    "settings":         {"insert_only": false, "cols": ["id","volunteer_after_days","ground_rules","push_kill_switch"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility","tool_location","tool_condition","last_used_by"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for","template_key","started_at"]},
    "job_rota":         {"insert_only": false, "cols": ["id","weekday","chore","member_id"]},
    "projects":         {"insert_only": false, "cols": ["id","title","kind","target_kes","notes","job_id","status"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id","project_id","mpesa_code","counterparty"]},
    "budgets":          {"insert_only": false, "cols": ["id","month","category_id","amount_kes"]},
    "meetings":         {"insert_only": false, "cols": ["id","held_on","host_id","notes","status"]},
    "agenda_items":     {"insert_only": false, "cols": ["id","meeting_id","title","minutes","source","source_job_id","sort"]},
    "decisions":        {"insert_only": false, "cols": ["id","meeting_id","decided_on","text","job_id"]},
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb;
$$;
revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
