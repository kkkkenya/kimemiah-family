-- A Laundry kind of job (washing, hanging, ironing), for the bigger job library.
alter table public.jobs drop constraint jobs_category_check;
alter table public.jobs add constraint jobs_category_check check (category in (
  'kitchen_dishes', 'cooking_house', 'compound_garden', 'water_tanks', 'dogs_pets',
  'house_cleaning', 'laundry', 'shopping_errand', 'utilities_dad', 'maintenance_fix'));
