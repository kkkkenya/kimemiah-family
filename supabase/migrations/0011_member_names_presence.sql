-- The family's real names, and where each person is right now.

update public.members set name = v.name
from (values
  ('00000000-0000-0000-0001-000000000001'::uuid, 'Juliet'),
  ('00000000-0000-0000-0001-000000000002'::uuid, 'Peter (Mguu Kubwa)'),
  ('00000000-0000-0000-0001-000000000003'::uuid, 'Wanini'),
  ('00000000-0000-0000-0001-000000000004'::uuid, 'Daniel'),
  ('00000000-0000-0000-0001-000000000005'::uuid, 'Vinnie'),
  ('00000000-0000-0000-0001-000000000006'::uuid, 'Greg')
) as v(id, name)
where members.id = v.id;

-- at_home; out (errands or school, back later today); away (not living at home for now).
alter table public.members
  add column presence text not null default 'at_home' check (presence in ('at_home', 'out', 'away'));
update public.members set presence = 'away' where is_remote;

-- Each person sets their own, from their own phone (works offline through the outbox).
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

-- Update only: no new people from phones, and only your own row.
grant update (presence) on public.members to authenticated;
create policy own_presence on public.members for update to authenticated
  using (public.is_household() and id = public.current_member_id())
  with check (id = public.current_member_id());

revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
