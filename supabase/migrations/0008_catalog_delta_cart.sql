-- Catalog-first Shop: every phone keeps the whole catalog offline and pulls only rows
-- whose price, sale or stock changed (price_changed_at). Each product gets a default tier,
-- and shopping list rows get a number quantity for the cart stepper.

-- ---------------------------------------------------------------- catalog delta

alter table public.catalog_products
  add column price_changed_at timestamptz not null default now(),
  add column default_tier text not null default 'standard' check (default_tier in ('essential', 'standard', 'qol'));

create index idx_catalog_price_changed_at on public.catalog_products (price_changed_at);

-- The weekly upsert touches every row; only a real change should make phones download it again.
create function public.catalog_price_change_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.regular_price is not distinct from old.regular_price
     and new.sale_price is not distinct from old.sale_price
     and new.is_on_sale is not distinct from old.is_on_sale
     and new.in_stock is not distinct from old.in_stock
     and new.title is not distinct from old.title
     and new.default_tier is not distinct from old.default_tier then
    new.price_changed_at := old.price_changed_at;
  else
    new.price_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger catalog_products_price_delta before update on public.catalog_products
  for each row execute function public.catalog_price_change_check();

revoke execute on function public.catalog_price_change_check() from authenticated, anon, public;

-- Same tiers the scraper assigns (scripts/lib/product-parser.mjs, tierFor).
update public.catalog_products set default_tier = case
  when canonical_concept in ('maize-flour', 'wheat-flour', 'rice', 'cooking-oil', 'sugar', 'milk', 'bread', 'eggs', 'salt',
                             'toilet-tissue', 'bathing-soap', 'bar-soap') then 'essential'
  when category_group = 'home_qol'
    or canonical_concept in ('bucket', 'basin', 'hard-broom', 'soft-broom', 'mop', 'dustpan', 'food-container', 'clothes-pegs',
                             'hangers', 'led-bulb', 'kitchen-cloth', 'doormat', 'extension-cable', 'flask', 'sufuria') then 'qol'
  else 'standard'
end;

-- ---------------------------------------------------------------- cart quantity

alter table public.shopping_extras add column quantity numeric not null default 1 check (quantity > 0);

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","for_meal_slot_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id"]},
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

grant insert (quantity), update (quantity) on public.shopping_extras to authenticated;
revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
