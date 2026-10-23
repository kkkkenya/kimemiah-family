-- Monarch MVP phase 2: bill reminders the evening before, goals with a picture and a planned
-- monthly amount, and settle up (what the house owes someone who paid from their own money).

alter table public.bills add column remind boolean not null default true;
grant insert (remind), update (remind) on public.bills to authenticated;

alter table public.projects
  add column emoji text check (length(emoji) <= 16),
  add column photo_at timestamptz,               -- set when a photo is uploaded: family/goals/<id>.jpg
  add column planned_monthly_kes numeric check (planned_monthly_kes > 0),
  add column done_at timestamptz;                -- for the thank-you card on Home
grant insert (emoji, photo_at, planned_monthly_kes, done_at), update (emoji, photo_at, planned_monthly_kes, done_at) on public.projects to authenticated;

alter table public.money_entries
  add column paid_from text not null default 'house' check (paid_from in ('house', 'own')),
  add column payback_to uuid references public.members(id);  -- this entry pays someone back
grant insert (paid_from, payback_to) on public.money_entries to authenticated;

-- Goal photos: anyone in the house can add or replace one at family/goals/<project id>.jpg.
create policy family_goal_photo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'family' and name like 'goals/%' and public.is_household());
create policy family_goal_photo_update on storage.objects
  for update to authenticated
  using (bucket_id = 'family' and name like 'goals/%' and public.is_household())
  with check (bucket_id = 'family' and name like 'goals/%');

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
    "bills":            {"insert_only": false, "cols": ["id","name","category_id","usage_unit","every_days","usual_kes","note","sort","remind"]},
    "entry_reviews":    {"insert_only": false, "cols": ["id","entry_id","ask_to","question","status","answer"]},
    "money_rules":      {"insert_only": false, "cols": ["id","match","category_id","bill_id","shop_id","sort"]},
    "projects":         {"insert_only": false, "cols": ["id","title","kind","target_kes","notes","job_id","status","target_date","emoji","photo_at","planned_monthly_kes","done_at"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort","rollover","budget_group"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id","project_id","mpesa_code","counterparty","bill_id","usage_qty","paid_from","payback_to"]},
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
