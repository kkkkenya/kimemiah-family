-- Jobs quality of life: repeating jobs keep their usual-job id (so learned times and tools
-- follow) and never come back already overdue; and swaps, where someone asks another person to
-- take their part (optionally taking one of theirs in return), accepted in one tap.

create or replace function public.job_done_followups() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  step interval;
begin
  if old.done_at is not null or new.done_at is null then
    return null;
  end if;

  if new.next_stage is not null then
    insert into public.jobs (title, notes, category, strain, duration_min, people_needed, due_at, parent_job_id)
    values (
      coalesce(new.next_stage->>'title', 'Next step: ' || new.title),
      new.next_stage->>'notes',
      coalesce(new.next_stage->>'category', new.category),
      coalesce(new.next_stage->>'strain', 'medium'),
      coalesce((new.next_stage->>'duration_min')::int, new.duration_min),
      coalesce((new.next_stage->>'people_needed')::int, 1),
      greatest(coalesce(new.due_at, now()), now() + interval '3 hours'),
      new.id
    );
  end if;

  step := case new.repeat
    when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' end;
  if step is not null then
    -- Done late? The next one is a full step from now, not already overdue.
    insert into public.jobs (title, notes, category, strain, duration_min, people_needed, repeat, series_id, template_key,
                             due_at, next_stage, requires_funds, estimated_cost_kes, funds_status, planned_for)
    values (new.title, new.notes, new.category, new.strain, new.duration_min, new.people_needed, new.repeat,
            coalesce(new.series_id, new.id), new.template_key,
            greatest(coalesce(new.due_at, now()) + step, now() + step / 2), new.next_stage,
            new.requires_funds, new.estimated_cost_kes,
            case when new.requires_funds then 'discussing' else 'not_needed' end,
            new.planned_for + step);
  end if;
  return null;
end;
$$;

create table public.job_swaps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),         -- the job the asker wants to hand over
  to_member uuid not null references public.members(id),   -- who is asked
  offer_job_id uuid references public.jobs(id),            -- optional: the asker takes this one of theirs
  note text check (length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)              -- the asker
);
create index job_swaps_updated_at on public.job_swaps (updated_at);
create trigger set_row_meta before insert or update on public.job_swaps for each row execute function public.set_row_meta();
create trigger write_audit after insert or update on public.job_swaps for each row execute function public.write_audit();
alter table public.job_swaps enable row level security;
grant select on public.job_swaps to authenticated;
create policy household_read on public.job_swaps for select to authenticated using (public.is_household());
grant insert (id, job_id, to_member, offer_job_id, note, status), update (status, deleted_at) on public.job_swaps to authenticated;
create policy household_insert on public.job_swaps for insert to authenticated with check (public.is_household());
create policy household_update on public.job_swaps for update to authenticated using (public.is_household()) with check (public.is_household());

-- Moves one person's part on a job to another (adding to theirs if they're already on it).
-- The old row is closed quietly: it's a swap, not someone walking off the job.
create function public.move_part(p_job uuid, p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  part public.job_participants;
  theirs public.job_participants;
begin
  select * into part from public.job_participants where job_id = p_job and member_id = p_from and deleted_at is null for update;
  if not found then raise exception 'that part is no longer theirs'; end if;
  update public.job_participants set deleted_at = now(), handover_notified_at = now() where id = part.id;
  select * into theirs from public.job_participants where job_id = p_job and member_id = p_to and deleted_at is null for update;
  if found then
    update public.job_participants set effort_pct = least(100, theirs.effort_pct + part.effort_pct) where id = theirs.id;
  else
    insert into public.job_participants (job_id, member_id, effort_pct, role_note, status)
    values (p_job, p_to, part.effort_pct, part.role_note, part.status);
  end if;
end;
$$;
revoke execute on function public.move_part(uuid, uuid, uuid) from public, anon, authenticated;

-- The person asked accepts: their part and the asker's swap places.
create function public.accept_swap(p_swap uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  s public.job_swaps;
begin
  if me is null or not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  select * into s from public.job_swaps where id = p_swap and deleted_at is null for update;
  if not found or s.status <> 'open' then raise exception 'that swap is no longer open'; end if;
  if s.to_member <> me then raise exception 'that swap was asked of someone else'; end if;
  if exists (select 1 from public.jobs where id in (s.job_id, s.offer_job_id) and (done_at is not null or deleted_at is not null)) then
    raise exception 'one of those jobs is already done';
  end if;
  perform public.move_part(s.job_id, s.actor_id, me);
  if s.offer_job_id is not null then
    perform public.move_part(s.offer_job_id, me, s.actor_id);
  end if;
  update public.job_swaps set status = 'accepted' where id = s.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.accept_swap(uuid) from public, anon;
grant execute on function public.accept_swap(uuid) to authenticated;

create or replace function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select (
    select a
    from (select '{
    "members":          {"insert_only": false, "cols": ["id","presence","no_heavy","ease_until","name","avatar","home_photo","eating_out_on","phone"]},
    "settings":         {"insert_only": false, "cols": ["id","volunteer_after_days","ground_rules","push_kill_switch","budget_style"]},
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort","shopping_tier","is_fast_mover","canonical_group_key","canonical_concept","preferred_brand","brand_flexibility","tool_location","tool_condition","last_used_by"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","quantity","shop_id","item_id","bought_at","shopping_tier","catalog_product_id","preferred_store"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id","category","strain","duration_min","people_needed","urgent","due_at","parent_job_id","next_stage","requires_funds","estimated_cost_kes","funds_status","planned_for","template_key","started_at"]},
    "job_rota":         {"insert_only": false, "cols": ["id","weekday","chore","member_id"]},
    "bills":            {"insert_only": false, "cols": ["id","name","category_id","usage_unit","every_days","usual_kes","note","sort","remind"]},
    "entry_reviews":    {"insert_only": false, "cols": ["id","entry_id","ask_to","question","status","answer"]},
    "money_rules":      {"insert_only": false, "cols": ["id","match","category_id","bill_id","shop_id","sort"]},
    "job_swaps":        {"insert_only": false, "cols": ["id","job_id","to_member","offer_job_id","note","status"]},
    "projects":         {"insert_only": false, "cols": ["id","title","kind","target_kes","notes","job_id","status","target_date","emoji","photo_at","planned_monthly_kes","done_at"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort","rollover","budget_group"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id","project_id","mpesa_code","counterparty","bill_id","usage_qty","paid_from","payback_to"]},
    "budgets":          {"insert_only": false, "cols": ["id","month","category_id","amount_kes"]},
    "meetings":         {"insert_only": false, "cols": ["id","held_on","host_id","notes","status"]},
    "agenda_items":     {"insert_only": false, "cols": ["id","meeting_id","title","minutes","source","source_job_id","sort"]},
    "decisions":        {"insert_only": false, "cols": ["id","meeting_id","decided_on","text","job_id"]},
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb as a) x
  );
$$;
revoke execute on function public.mutation_allowlist() from public, anon;
grant execute on function public.mutation_allowlist() to authenticated;
