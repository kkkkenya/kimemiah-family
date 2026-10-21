-- Starter data. Safe to run more than once (fixed ids, on conflict do nothing).
-- Member names come from the family; edit them here before seeding.

insert into public.settings (id, volunteer_after_days, ground_rules)
values (
  '00000000-0000-0000-0000-000000000001',
  3,
  array[
    'No blaming. We talk about the house, not about who failed.',
    'Everyone speaks; nobody speaks over anyone.',
    'Earning or not, everyone''s time and effort counts.',
    'Phones stay down, except to look at the app.',
    'What we agree gets written down.'
  ]
)
on conflict do nothing;

-- Roles for now; rename later with: update public.members set name = '...' where id = '...';
insert into public.members (id, name, is_remote, sort) values
  ('00000000-0000-0000-0001-000000000001', 'Mom', false, 1),
  ('00000000-0000-0000-0001-000000000002', 'Dad', true, 2),
  ('00000000-0000-0000-0001-000000000003', 'Sister', false, 3),
  ('00000000-0000-0000-0001-000000000004', 'Big brother', false, 4),
  ('00000000-0000-0000-0001-000000000005', 'Brother', false, 5),
  ('00000000-0000-0000-0001-000000000006', 'Me', false, 6)
on conflict (id) do nothing;

insert into public.shops (id, name, kind, sort) values
  ('00000000-0000-0000-0002-000000000001', 'Supermarket', 'supermarket', 1),
  ('00000000-0000-0000-0002-000000000002', 'Market', 'market', 2),
  ('00000000-0000-0000-0002-000000000003', 'Mama mboga', 'mama_mboga', 3),
  ('00000000-0000-0000-0002-000000000004', 'Wholesaler', 'wholesaler', 4),
  ('00000000-0000-0000-0002-000000000005', 'Other', 'other', 5)
on conflict (id) do nothing;

insert into public.budget_categories (id, name, sort) values
  ('00000000-0000-0000-0003-000000000001', 'Food staples', 1),
  ('00000000-0000-0000-0003-000000000002', 'Market and fresh', 2),
  ('00000000-0000-0000-0003-000000000003', 'Cleaning', 3),
  ('00000000-0000-0000-0003-000000000004', 'Personal care', 4),
  ('00000000-0000-0000-0003-000000000005', 'Utilities', 5),
  ('00000000-0000-0000-0003-000000000006', 'Other', 6)
on conflict (id) do nothing;

-- More places we buy from (kind 'other' covers the ones without their own type).
insert into public.shops (id, name, kind, sort) values
  ('00000000-0000-0000-0002-000000000006', 'Kiosk', 'other', 6),
  ('00000000-0000-0000-0002-000000000007', 'Gas dealer', 'other', 7),
  ('00000000-0000-0000-0002-000000000008', 'Water vendor', 'other', 8),
  ('00000000-0000-0000-0002-000000000009', 'M-Pesa', 'other', 9)
on conflict (id) do nothing;

-- Starter stock list from 04-starter-stock-list.md. Ids are derived from the name,
-- so running this again changes nothing. The family edits these in the app.
insert into public.stock_items (id, name, category, unit, min_qty, shop_id, track_mode, sort)
select md5('stock:' || v.name)::uuid, v.name, v.category, v.unit, v.min_qty, s.id, v.track_mode, v.sort
from (values
  ('Maize flour (unga)', 'kitchen_staples', '2 kg packet', 2, 'Supermarket', 'count', 1),
  ('Wheat flour (chapati)', 'kitchen_staples', '2 kg packet', 1, 'Supermarket', 'count', 2),
  ('Rice', 'kitchen_staples', 'kg', 2, 'Supermarket', 'count', 3),
  ('Sugar', 'kitchen_staples', 'kg', 2, 'Supermarket', 'count', 4),
  ('Cooking oil', 'kitchen_staples', 'litre', 2, 'Supermarket', 'count', 5),
  ('Salt', 'kitchen_staples', '500 g packet', 1, 'Supermarket', 'count', 6),
  ('Beans', 'kitchen_staples', 'kg', 1, 'Market', 'count', 7),
  ('Green grams (ndengu)', 'kitchen_staples', 'kg', 1, 'Market', 'count', 8),
  ('Spaghetti', 'kitchen_staples', 'packet', 2, 'Supermarket', 'count', 9),
  ('Royco / stock cubes', 'kitchen_staples', 'packet', 1, 'Supermarket', 'count', 10),
  ('Spices (curry, pilau masala)', 'kitchen_staples', 'packet', 1, 'Supermarket', 'count', 11),
  ('Tomato paste', 'kitchen_staples', 'tin/sachet', 2, 'Supermarket', 'count', 12),
  ('Sukuma wiki', 'fresh_produce', 'bunch', 2, 'Mama mboga', 'level', 20),
  ('Cabbage', 'fresh_produce', 'head', 1, 'Market', 'level', 21),
  ('Tomatoes', 'fresh_produce', 'kg', 1, 'Market', 'level', 22),
  ('Onions', 'fresh_produce', 'kg', 1, 'Market', 'level', 23),
  ('Potatoes', 'fresh_produce', 'kg', 2, 'Market', 'level', 24),
  ('Carrots', 'fresh_produce', 'kg', 0.5, 'Market', 'level', 25),
  ('Dhania', 'fresh_produce', 'bunch', 1, 'Mama mboga', 'level', 26),
  ('Bananas', 'fresh_produce', 'bunch', 1, 'Market', 'level', 27),
  ('Eggs', 'fresh_produce', 'tray', 1, 'Supermarket', 'count', 28),
  ('Milk', 'drinks_breakfast', '500 ml packet', 4, 'Kiosk', 'count', 30),
  ('Tea leaves', 'drinks_breakfast', '500 g packet', 1, 'Supermarket', 'count', 31),
  ('Bread', 'drinks_breakfast', 'loaf', 1, 'Kiosk', 'count', 32),
  ('Margarine (Blue Band)', 'drinks_breakfast', '500 g tub', 1, 'Supermarket', 'count', 33),
  ('Drinking water', 'drinks_breakfast', '20 L refill', 1, 'Water vendor', 'count', 34),
  ('Washing powder (Omo)', 'cleaning', '1 kg packet', 1, 'Supermarket', 'count', 40),
  ('Bar soap', 'cleaning', 'bar', 2, 'Supermarket', 'count', 41),
  ('Dishwashing liquid', 'cleaning', '500 ml', 1, 'Supermarket', 'count', 42),
  ('Bleach (Jik)', 'cleaning', '750 ml', 1, 'Supermarket', 'count', 43),
  ('Steel wool / sponge', 'cleaning', 'piece', 2, 'Supermarket', 'count', 44),
  ('Floor cleaner', 'cleaning', 'litre', 1, 'Supermarket', 'count', 45),
  ('Bin liners', 'cleaning', 'roll', 1, 'Supermarket', 'count', 46),
  ('Toilet paper', 'bathroom', 'roll', 6, 'Supermarket', 'count', 50),
  ('Bathing soap', 'bathroom', 'bar', 2, 'Supermarket', 'count', 51),
  ('Toothpaste', 'bathroom', 'tube', 1, 'Supermarket', 'count', 52),
  ('Petroleum jelly / lotion', 'bathroom', 'tub', 1, 'Supermarket', 'count', 53),
  ('Cooking gas', 'utilities', '13 kg cylinder', 1, 'Gas dealer', 'count', 60),
  ('KPLC tokens', 'utilities', 'units', 30, 'M-Pesa', 'count', 61),
  ('Matches', 'utilities', 'box', 2, 'Kiosk', 'count', 62),
  ('Charcoal', 'utilities', 'sack', 1, 'Market', 'count', 63)
) as v(name, category, unit, min_qty, shop, track_mode, sort)
join public.shops s on s.name = v.shop
on conflict (id) do nothing;

-- ---------------------------------------------------------------- smart shopping (migration 0005)

-- Supermarkets by name, plus "either" for when it doesn't matter.
insert into public.shops (id, name, kind, sort) values
  ('00000000-0000-0000-0002-000000000010', 'Naivas', 'supermarket', 1),
  ('00000000-0000-0000-0002-000000000011', 'Quickmart', 'supermarket', 2)
on conflict (id) do nothing;
update public.shops set name = 'Supermarket (either)', sort = 3
 where id = '00000000-0000-0000-0002-000000000001' and name <> 'Supermarket (either)';

-- No kiosk: kiosk prices run 20-40% higher, so fast movers belong to the supermarket run.
update public.stock_items set shop_id = '00000000-0000-0000-0002-000000000001'
 where shop_id = '00000000-0000-0000-0002-000000000006';
update public.shopping_extras set shop_id = '00000000-0000-0000-0002-000000000001'
 where shop_id = '00000000-0000-0000-0002-000000000006';
update public.shops set deleted_at = now()
 where id = '00000000-0000-0000-0002-000000000006' and deleted_at is null;

-- Tier, fast mover and product family for the starter list.
update public.stock_items s set
  shopping_tier = v.tier,
  is_fast_mover = v.fast,
  canonical_group_key = v.key,
  canonical_concept = v.concept
from (values
  ('Maize flour (unga)', 'essential', true, 'maize-flour-2kg', 'maize-flour'),
  ('Wheat flour (chapati)', 'standard', false, 'wheat-flour-2kg', 'wheat-flour'),
  ('Rice', 'essential', false, 'rice-2kg', 'rice'),
  ('Sugar', 'essential', true, 'sugar-2kg', 'sugar'),
  ('Cooking oil', 'essential', false, 'cooking-oil-2l', 'cooking-oil'),
  ('Salt', 'essential', false, 'salt-500g', 'salt'),
  ('Spaghetti', 'standard', false, 'spaghetti-500g', 'spaghetti'),
  ('Royco / stock cubes', 'standard', false, 'stock-cubes-200g', 'stock-cubes'),
  ('Spices (curry, pilau masala)', 'standard', false, null, 'spices'),
  ('Tomato paste', 'standard', false, null, 'tomato-paste'),
  ('Eggs', 'essential', true, 'eggs-30pk', 'eggs'),
  ('Milk', 'essential', true, 'milk-500ml', 'milk'),
  ('Tea leaves', 'standard', false, 'tea-leaves-500g', 'tea-leaves'),
  ('Bread', 'essential', true, 'bread-400g', 'bread'),
  ('Margarine (Blue Band)', 'standard', false, 'margarine-500g', 'margarine'),
  ('Drinking water', 'essential', false, null, null),
  ('Washing powder (Omo)', 'standard', false, 'washing-powder-1kg', 'washing-powder'),
  ('Bar soap', 'essential', false, 'bar-soap-800g', 'bar-soap'),
  ('Dishwashing liquid', 'standard', false, 'dish-liquid-500ml', 'dish-liquid'),
  ('Bleach (Jik)', 'standard', false, 'bleach-750ml', 'bleach'),
  ('Steel wool / sponge', 'standard', false, null, 'steel-wool'),
  ('Floor cleaner', 'standard', false, 'floor-cleaner-1l', 'floor-cleaner'),
  ('Bin liners', 'standard', false, null, 'bin-liners'),
  ('Toilet paper', 'essential', true, 'toilet-tissue-10pk', 'toilet-tissue'),
  ('Bathing soap', 'essential', false, null, 'bathing-soap'),
  ('Toothpaste', 'standard', false, null, 'toothpaste'),
  ('Petroleum jelly / lotion', 'standard', false, null, 'petroleum-jelly'),
  ('Cooking gas', 'essential', false, null, null),
  ('KPLC tokens', 'essential', false, null, null),
  ('Matches', 'standard', false, null, 'matches')
) as v(name, tier, fast, key, concept)
where s.name = v.name;

-- Drinks and household upgrades. Minimum 0: they never show as Low; add them to the list when wanted.
insert into public.stock_items (id, name, category, unit, min_qty, shop_id, track_mode, sort, shopping_tier, canonical_group_key, canonical_concept)
select md5('stock:' || v.name)::uuid, v.name, v.category, v.unit, 0, '00000000-0000-0000-0002-000000000001', 'count', v.sort, v.tier, v.key, v.concept
from (values
  ('Beer (lager)', 'drinks_alcohol', '500 ml', 70, 'standard', 'lager-beer-500ml', 'lager-beer'),
  ('Wine', 'drinks_alcohol', '750 ml bottle', 71, 'standard', 'red-wine-750ml', 'red-wine'),
  ('Gin', 'drinks_alcohol', '750 ml bottle', 72, 'standard', 'gin-750ml', 'gin'),
  ('Soft broom', 'home_upgrades', 'piece', 80, 'qol', 'soft-broom', 'soft-broom'),
  ('Mop', 'home_upgrades', 'piece', 81, 'qol', null, 'mop'),
  ('Bucket (20 L, with lid)', 'home_upgrades', 'piece', 82, 'qol', 'bucket-20l', 'bucket'),
  ('Basin', 'home_upgrades', 'piece', 83, 'qol', null, 'basin'),
  ('Food storage containers', 'home_upgrades', 'set', 84, 'qol', null, 'food-container'),
  ('Clothes pegs', 'home_upgrades', 'pack', 85, 'qol', null, 'clothes-pegs'),
  ('LED bulb', 'home_upgrades', 'piece', 86, 'qol', null, 'led-bulb'),
  ('Kitchen cloths', 'home_upgrades', 'pack', 87, 'qol', null, 'kitchen-cloth'),
  ('Doormat', 'home_upgrades', 'piece', 88, 'qol', null, 'doormat')
) as v(name, category, unit, sort, tier, key, concept)
on conflict (id) do nothing;

-- Family names aligned with the spec (lager-beer, red-wine, soft-broom).
update public.stock_items set canonical_group_key = 'lager-beer-500ml', canonical_concept = 'lager-beer' where name = 'Beer (lager)' and canonical_concept = 'beer';
update public.stock_items set canonical_group_key = 'red-wine-750ml', canonical_concept = 'red-wine' where name = 'Wine' and canonical_concept = 'wine';
update public.stock_items set canonical_group_key = 'soft-broom', canonical_concept = 'soft-broom' where name = 'Soft broom' and canonical_concept = 'broom';
