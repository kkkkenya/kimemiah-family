-- The house doesn't use KPLC prepaid tokens: remove the stock item and its "ask Peter" job trigger.
update public.stock_items set restock_job = null, deleted_at = now() where name = 'KPLC tokens' and deleted_at is null;
update public.jobs set deleted_at = now() where template_key = 'tokens' and done_at is null and deleted_at is null;
