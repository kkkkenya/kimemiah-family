-- Shop, reworked for markets as much as supermarkets: each thing in the basket keeps how many,
-- the unit, the unit price and the line total; a trip keeps how it was paid (M-Pesa with its
-- code, or cash), the amount paid, any bargaining discount, and the money entry it became. List
-- items can be marked "needed soon" instead of the old tiers.

alter table public.trip_lines
  add column title text,
  add column unit text,
  add column unit_price_kes numeric check (unit_price_kes >= 0),
  add column total_kes numeric check (total_kes >= 0),
  add column icon text;
grant insert (title, unit, unit_price_kes, total_kes, icon), update (title, unit, unit_price_kes, total_kes, icon, qty_bought, deleted_at) on public.trip_lines to authenticated;

alter table public.shopping_trips
  add column paid_kes numeric check (paid_kes >= 0),
  add column method text check (method in ('mpesa', 'cash', 'other')),
  add column mpesa_code text,
  add column paid_from text check (paid_from in ('house', 'own')),
  add column money_entry_id uuid references public.money_entries(id),
  add column discount_kes numeric;
grant insert (paid_kes, method, mpesa_code, paid_from, money_entry_id, discount_kes),
      update (paid_kes, method, mpesa_code, paid_from, money_entry_id, discount_kes) on public.shopping_trips to authenticated;

alter table public.shopping_extras add column urgent boolean not null default false;
grant insert (urgent), update (urgent) on public.shopping_extras to authenticated;

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select (
    select a
    from (select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until","name","avatar","home_photo","eating_out_on","phone","alert_amounts"]},
    "settings":         {"insert_only": false, "cols": ["id","volunteer_after_days","ground_rules","push_kill_switch","budget_style"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility","tool_location","tool_condition","last_used_by"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at","paid_kes","method","mpesa_code","paid_from","money_entry_id","discount_kes"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","bought_at","shopping_tier","catalog_product_id","preferred_store","urgent"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found","title","unit","unit_price_kes","total_kes","icon"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for","template_key","started_at"]},
    "job_rota":         {"insert_only": false, "cols": ["id","weekday","chore","member_id"]},
    "bills":            {"insert_only": false, "cols": ["id","name","category_id","usage_unit","every_days","usual_kes","note","sort","remind"]},
    "entry_reviews":    {"insert_only": false, "cols": ["id","entry_id","ask_to","question","status","answer"]},
    "money_rules":      {"insert_only": false, "cols": ["id","match","category_id","bill_id","shop_id","sort"]},
    "job_swaps":        {"insert_only": false, "cols": ["id","job_id","to_member","offer_job_id","note","status"]},
    "notifications":    {"insert_only": false, "cols": ["id","read_at"]},
    "projects":         {"insert_only": false, "cols": ["id","title","kind","target_kes","notes","job_id","status","target_date","emoji","photo_at","planned_monthly_kes","done_at"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort","rollover","budget_group"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id","project_id","mpesa_code","counterparty","bill_id","usage_qty","paid_from","payback_to"]},
    "budgets":          {"insert_only": false, "cols": ["id","month","category_id","amount_kes"]},
    "meetings":         {"insert_only": false, "cols": ["id","held_on","host_id","notes","status","attendees","start_time"]},
    "agenda_items":     {"insert_only": false, "cols": ["id","meeting_id","title","minutes","source","source_job_id","sort"]},
    "decisions":        {"insert_only": false, "cols": ["id","meeting_id","decided_on","text","job_id","owner_id","due_on","done_at"]},
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb as a) x
  );
$$;
revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
