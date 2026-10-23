-- The monthly money review can be an agenda item (it links to the review in the app).
alter table public.agenda_items drop constraint agenda_items_source_check;
alter table public.agenda_items add constraint agenda_items_source_check check (source in ('manual','template','waiting_job','help','flag','money_review'));
