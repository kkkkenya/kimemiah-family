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
