-- Stock (Phase 2b): have_qty is the sum of stock_movements, so two offline phones
-- lowering the same item both count. When an item reaches Out the server stamps
-- last_out_at and keeps the "ran out early" streak for bulk items.

-- How many days apart the big (Full shop) runs are planned. Bi-weekly to start.
alter table public.settings add column bulk_run_every_days int not null default 14 check (bulk_run_every_days between 3 and 60);

-- Recount an item after each movement. Phones can't write have_qty, so this runs as the owner.
create function public.stock_movement_total() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.stock_items s
     set have_qty = coalesce((
           select sum(m.delta) from public.stock_movements m
            where m.item_id = new.item_id and m.deleted_at is null
         ), 0)
   where s.id = new.item_id;
  return null;
end;
$$;

create trigger stock_movement_total after insert or update on public.stock_movements
  for each row execute function public.stock_movement_total();

-- On the change to Out: stamp last_out_at, and for bulk items (not fast movers) count
-- how many runs in a row it ran out more than 4 days before the next planned bulk run.
-- The planned run is the last put-away of this item plus settings.bulk_run_every_days.
create function public.stock_out_watch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_out boolean;
  is_out boolean;
  restocked timestamptz;
  every_days int;
begin
  was_out := case when old.track_mode = 'level' then old.level = 'out' else old.min_qty > 0 and old.have_qty <= 0 end;
  is_out  := case when new.track_mode = 'level' then new.level = 'out' else new.min_qty > 0 and new.have_qty <= 0 end;
  if not is_out or was_out then
    return new;
  end if;

  if not new.is_fast_mover then
    select max(m.created_at) into restocked
      from public.stock_movements m
     where m.item_id = new.id and m.reason = 'put_away' and m.deleted_at is null;
    -- Count each run once: only if it was restocked since it last ran out.
    if restocked is not null and (old.last_out_at is null or restocked > old.last_out_at) then
      select coalesce(max(st.bulk_run_every_days), 14) into every_days from public.settings st where st.deleted_at is null;
      if now() < restocked + make_interval(days => every_days - 4) then
        new.early_depletion_streak := old.early_depletion_streak + 1;
      else
        new.early_depletion_streak := 0;
      end if;
    end if;
  end if;

  new.last_out_at := now();
  return new;
end;
$$;

create trigger stock_out_watch before update on public.stock_items
  for each row execute function public.stock_out_watch();

revoke execute on function public.stock_movement_total() from authenticated, anon, public;
revoke execute on function public.stock_out_watch() from authenticated, anon, public;
