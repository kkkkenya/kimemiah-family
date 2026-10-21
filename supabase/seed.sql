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
