-- Which store branch a run's prices came from (Quickmart prices by branch).
alter table public.scrape_runs add column branch_id text;
