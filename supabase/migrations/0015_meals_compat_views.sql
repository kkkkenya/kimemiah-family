-- Phones still running the previous app version pull meals, meal_ingredients and meal_slots
-- on every sync. Empty stand-ins keep their sync working until they update; drop these once
-- every phone runs the version without Meals.
create view public.meals with (security_invoker = true) as
  select null::uuid as id, null::text as name, null::timestamptz as created_at, null::timestamptz as updated_at,
         null::timestamptz as deleted_at, null::uuid as actor_id
  where false;
create view public.meal_ingredients with (security_invoker = true) as
  select null::uuid as id, null::uuid as meal_id, null::timestamptz as updated_at, null::timestamptz as deleted_at where false;
create view public.meal_slots with (security_invoker = true) as
  select null::uuid as id, null::date as day, null::uuid as cook_id, null::timestamptz as updated_at, null::timestamptz as deleted_at where false;
grant select on public.meals, public.meal_ingredients, public.meal_slots to authenticated;
