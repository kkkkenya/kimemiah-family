-- "I'll be out for supper tonight" (so the cook knows how many), and compound tools tracked by
-- where they are and whether they work, instead of OK / Low / Out.

alter table public.members add column eating_out_on date; -- the Nairobi date someone said they'd be out for supper
grant update (eating_out_on) on public.members to authenticated;

alter table public.stock_items drop constraint stock_items_track_mode_check;
alter table public.stock_items add constraint stock_items_track_mode_check check (track_mode in ('count', 'level', 'tool'));
alter table public.stock_items
  add column tool_location text,
  add column tool_condition text check (tool_condition in ('working', 'needs_fix')),
  add column last_used_by uuid references public.members(id);
grant insert (tool_location, tool_condition, last_used_by), update (tool_location, tool_condition, last_used_by) on public.stock_items to authenticated;

insert into public.stock_items (name, category, unit, min_qty, track_mode, tool_location, tool_condition, sort)
select v.name, 'tools', 'piece', 0, 'tool', v.loc, 'working', v.sort
from (values
  ('Panga', 'Store room', 200),
  ('Slasher', 'Store room', 201),
  ('Hedge shears', 'Store room', 202),
  ('Jembe', 'Store room', 203),
  ('Rake', 'Store room', 204),
  ('Hosepipe', 'Back verandah', 205),
  ('Dog shampoo and brush', 'Dog kennel', 206),
  ('Extension cable', 'Main house', 207),
  ('Ladder', 'Store room', 208)
) as v(name, loc, sort)
where not exists (select 1 from public.stock_items s where s.name = v.name and s.deleted_at is null);

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
