-- Smart shopping: tiers (Essentials / Full shop / Upgrades), anti-kiosk fast movers,
-- brand preferences, and the weekly Naivas / Quickmart price catalog.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- stock_items and shopping_extras

alter table public.stock_items
  add column shopping_tier text not null default 'standard' check (shopping_tier in ('essential', 'standard', 'qol')),
  add column is_fast_mover boolean not null default false,
  add column canonical_group_key text,          -- exact pack, e.g. cooking-oil-2l
  add column canonical_concept text,            -- product family, e.g. cooking-oil (all sizes and brands)
  add column preferred_brand text,
  add column brand_flexibility text not null default 'any_cheapest'
    check (brand_flexibility in ('any_cheapest', 'prefer_named', 'strict_named')),
  add column last_out_at timestamptz,
  add column early_depletion_streak int not null default 0;

alter table public.shopping_extras
  add column shopping_tier text not null default 'standard' check (shopping_tier in ('essential', 'standard', 'qol')),
  add column catalog_product_id uuid,
  add column preferred_store text
    check (preferred_store in ('naivas', 'quickmart', 'market', 'mama_mboga', 'wholesaler', 'any'));

-- ---------------------------------------------------------------- catalog

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  store text not null check (store in ('naivas', 'quickmart')),
  external_sku text not null,
  title text not null,
  brand text,
  category_group text not null
    check (category_group in ('food_cupboard', 'dairy_bakery', 'beverages', 'liquor_alcohol', 'cleaning_laundry', 'toiletries', 'home_qol', 'deals')),
  subcategory text,
  canonical_group_key text,
  canonical_concept text,
  pack_size_label text,
  normalized_qty numeric(10, 3),
  normalized_unit text check (normalized_unit in ('kg', 'liter', 'unit')),
  regular_price numeric(10, 2) not null,
  sale_price numeric(10, 2),
  effective_price numeric(10, 2) generated always as (coalesce(sale_price, regular_price)) stored,
  discount_pct numeric(5, 2) generated always as (
    case
      when sale_price is not null and regular_price > 0 and sale_price < regular_price
      then round(((regular_price - sale_price) / regular_price) * 100, 1)
      else 0
    end
  ) stored,
  unit_price numeric(10, 2),
  is_on_sale boolean not null default false,
  promo_ends_at timestamptz,
  product_url text,
  in_stock boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store, external_sku)
);

create index idx_catalog_canonical_group on public.catalog_products (canonical_group_key) where in_stock;
create index idx_catalog_concept on public.catalog_products (canonical_concept) where in_stock;
create index idx_catalog_on_sale on public.catalog_products (is_on_sale, discount_pct desc) where is_on_sale;
create index idx_catalog_search_trgm on public.catalog_products using gin (title extensions.gin_trgm_ops);

create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  store text not null check (store in ('naivas', 'quickmart')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  items_upserted int not null default 0,
  items_on_sale int not null default 0,
  error_summary text
);

-- Read for unlocked family phones; only the scraper (service role) writes.
alter table public.catalog_products enable row level security;
alter table public.scrape_runs enable row level security;
grant select on public.catalog_products, public.scrape_runs to authenticated;
grant all on public.catalog_products, public.scrape_runs to service_role;
create policy household_read on public.catalog_products for select to authenticated using (public.is_household());
create policy household_read on public.scrape_runs for select to authenticated using (public.is_household());

-- ---------------------------------------------------------------- views

-- What phones keep offline: for each product family the house tracks, the 10 cheapest
-- per store (exact pack size first); anything linked from the shopping list; and the
-- 100 steepest current deals. A few hundred rows, not the whole catalog.
create view public.offline_price_matches with (security_invoker = true) as
with tracked as (
  select distinct canonical_concept as concept, canonical_group_key as key
  from public.stock_items
  where deleted_at is null and canonical_concept is not null
),
ranked as (
  select c.*,
         row_number() over (
           partition by c.canonical_concept, c.store
           order by (c.canonical_group_key in (select key from tracked where concept = c.canonical_concept)) desc,
                    c.unit_price nulls last, c.effective_price
         ) as rn
  from public.catalog_products c
  where c.in_stock and c.last_seen_at > now() - interval '21 days'
    and c.canonical_concept in (select concept from tracked)
),
picked as (
  select id from ranked where rn <= 10
  union
  select catalog_product_id from public.shopping_extras
   where catalog_product_id is not null and deleted_at is null and bought_at is null
  union
  select id from (
    select id from public.catalog_products
     where in_stock and is_on_sale and discount_pct >= 15 and last_seen_at > now() - interval '21 days'
     order by discount_pct desc
     limit 100
  ) deals
)
select c.id, c.store, c.title, c.brand, c.category_group, c.canonical_group_key, c.canonical_concept,
       c.pack_size_label, c.normalized_qty, c.normalized_unit, c.regular_price, c.sale_price,
       c.effective_price, c.discount_pct, c.unit_price, c.is_on_sale, c.product_url, c.last_seen_at, c.updated_at
from public.catalog_products c
where c.id in (select id from picked);

-- Items that are Low or Out at home.
create view public.shopping_needed with (security_invoker = true) as
select s.*,
       case
         when s.track_mode = 'level' then s.level
         when s.have_qty <= 0 then 'out'
         when s.have_qty <= s.min_qty then 'low'
         else 'ok'
       end as status
from public.stock_items s
where s.deleted_at is null
  and (
    (s.track_mode = 'level' and s.level in ('low', 'out'))
    or (s.track_mode = 'count' and s.min_qty > 0 and s.have_qty <= s.min_qty)
  );

grant select on public.offline_price_matches, public.shopping_needed to authenticated;

-- ---------------------------------------------------------------- what phones may change

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","shop_id","item_id","for_meal_slot_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
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

grant insert (shopping_tier, is_fast_mover, canonical_group_key, canonical_concept, preferred_brand, brand_flexibility),
      update (shopping_tier, is_fast_mover, canonical_group_key, canonical_concept, preferred_brand, brand_flexibility)
  on public.stock_items to authenticated;
grant insert (shopping_tier, catalog_product_id, preferred_store),
      update (shopping_tier, catalog_product_id, preferred_store)
  on public.shopping_extras to authenticated;
revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
