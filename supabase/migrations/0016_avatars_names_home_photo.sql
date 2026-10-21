-- Profile pictures, display names and each person's own Home photo.

alter table public.members
  add column avatar text check (avatar ~ '^a[0-9]{1,2}$'),               -- picture in family/avatars/<avatar>.jpg
  add column home_photo text check (home_photo ~ '^(family|own:[0-9]+)$'), -- null: no photo on Home
  add constraint members_name_length check (length(trim(name)) between 1 and 40);

grant update (name, avatar, home_photo) on public.members to authenticated;

-- Pictures are readable as soon as a phone is unlocked, so they show on "Who are you?".
create policy family_avatars_device_read on storage.objects
  for select to authenticated
  using (bucket_id = 'family' and name like 'avatars/%' and public.is_device());

-- Each person can upload (and replace) only their own Home photo: family/home/<member id>.jpg.
create policy family_own_home_photo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'family' and name = 'home/' || public.current_member_id()::text || '.jpg' and public.is_household());
create policy family_own_home_photo_update on storage.objects
  for update to authenticated
  using (bucket_id = 'family' and name = 'home/' || public.current_member_id()::text || '.jpg' and public.is_household())
  with check (bucket_id = 'family' and name = 'home/' || public.current_member_id()::text || '.jpg');

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until","name","avatar","home_photo"]},
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
