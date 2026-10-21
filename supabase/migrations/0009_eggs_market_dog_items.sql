-- House list updates from the family, 21 Oct 2026.
-- Eggs come from the market at KES 470 a tray, not the supermarket. The dog's food and care
-- come from the vet (unga at KES 55/kg, dewormer, shampoo, Pestigon) and Kenchic (meat at KES 190/kg).

insert into public.shops (id, name, kind, sort) values
  ('00000000-0000-0000-0002-000000000020', 'Vet', 'other', 12),
  ('00000000-0000-0000-0002-000000000021', 'Kenchic', 'other', 13)
on conflict (id) do nothing;

-- Market price, so no supermarket catalog match (that would price eggs at Quickmart).
update public.stock_items
   set shop_id = (select id from public.shops where name = 'Market' and deleted_at is null limit 1),
       usual_price_kes = 470,
       canonical_concept = null,
       canonical_group_key = null
 where name = 'Eggs' and deleted_at is null;

-- One tap OK / Low / Out: how much lasts a month isn't settled yet.
insert into public.stock_items (name, category, unit, min_qty, usual_price_kes, shop_id, track_mode, shopping_tier, sort)
select v.name, 'pets', v.unit, 1, v.price, s.id, 'level', v.tier, v.sort
from (values
  ('Dog unga', 'kg', 55, 'essential', 'Vet', 90),
  ('Dog meat', 'kg', 190, 'essential', 'Kenchic', 91),
  ('Dog dewormer', 'dose', null, 'standard', 'Vet', 92),
  ('Dog shampoo', 'bottle', null, 'standard', 'Vet', 93),
  ('Pestigon (ticks and fleas)', 'bottle', null, 'standard', 'Vet', 94)
) as v(name, unit, price, tier, shop, sort)
join public.shops s on s.name = v.shop and s.deleted_at is null
where not exists (select 1 from public.stock_items i where i.name = v.name and i.deleted_at is null);
