-- Meals removed (cooking is a job now); per-person job preferences; house settings editable from
-- Settings; bookkeeping for suggestion and "how am I doing" alerts.

-- ---------------------------------------------------------------- meals out (all three tables were empty)

alter table public.shopping_extras drop column for_meal_slot_id;
drop table public.meal_ingredients;
drop table public.meal_slots;
drop table public.meals;

-- ---------------------------------------------------------------- people

alter table public.members
  add column no_heavy boolean not null default false,  -- never suggest heavy jobs (set by the person)
  add column ease_until timestamptz,                   -- "take it easy": no suggestions until then
  add column ease_offered_at timestamptz,              -- server only: last "you're doing a lot" alert
  add column nudged_at timestamptz;                    -- server only: last "jobs that suit you" alert

-- Wanini said she can't do heavy work; she can change this in Settings.
update public.members set no_heavy = true where id = '00000000-0000-0000-0001-000000000003';

grant update (no_heavy, ease_until) on public.members to authenticated;

-- ---------------------------------------------------------------- jobs

alter table public.jobs add column suggested_notified_at timestamptz; -- server only

-- ---------------------------------------------------------------- settings from the app

grant update (volunteer_after_days, ground_rules, push_kill_switch) on public.settings to authenticated;
create policy household_update on public.settings for update to authenticated using (public.is_household()) with check (public.is_household());

-- ---------------------------------------------------------------- what phones may change

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until"]},
    "settings":         {"insert_only": false, "cols": ["id","volunteer_after_days","ground_rules","push_kill_switch"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
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
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb;
$$;

revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
