-- Kimemiah family app: foundation schema (Phase 1)
-- Every synced table: client-made uuid id, created_at, updated_at, deleted_at, actor_id.
-- Access: anonymous key sees nothing; only unlocked phones with a member picked (is_household) read/write.
-- No delete permission anywhere: rows are soft-deleted with deleted_at.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- people and phones

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  colour text,
  is_remote boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid
);

-- One row per signed-in phone. id is the phone's Supabase auth user id.
create table public.devices (
  id uuid primary key,
  member_id uuid references public.members(id),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Failed PIN attempts, server only (no policies).
create table public.auth_failures (
  id bigserial primary key,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index auth_failures_at on public.auth_failures (at);
create index auth_failures_ip_at on public.auth_failures (ip_hash, at);

-- ---------------------------------------------------------------- access helpers

create function public.is_device() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.devices d
    where d.id = auth.uid() and d.revoked_at is null
  );
$$;

create function public.is_household() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.devices d
    where d.id = auth.uid() and d.revoked_at is null and d.member_id is not null
  );
$$;

create function public.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.member_id from public.devices d
  where d.id = auth.uid() and d.revoked_at is null;
$$;

-- "Who are you?": link this phone to a member.
create function public.set_device_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.members m where m.id = p_member and m.active and m.deleted_at is null) then
    raise exception 'unknown member' using errcode = '22023';
  end if;
  update public.devices
     set member_id = p_member, updated_at = now(), last_seen_at = now()
   where id = auth.uid() and revoked_at is null;
  if not found then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- house data

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  volunteer_after_days int not null default 3,
  ground_rules text[] not null default '{}',
  push_kill_switch boolean not null default false,
  pin_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create unique index settings_single_row on public.settings ((true));

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other' check (kind in ('supermarket','market','mama_mboga','wholesaler','other')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other',
  unit text not null default 'piece',
  min_qty numeric not null default 1,
  usual_price_kes numeric,
  shop_id uuid references public.shops(id),
  track_mode text not null default 'count' check (track_mode in ('count','level')),
  level text not null default 'ok' check (level in ('ok','low','out')),
  have_qty numeric not null default 0,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

-- Insert-only +/- changes; stock_items.have_qty is their running total (trigger added in Phase 2).
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items(id),
  delta numeric not null,
  reason text,
  trip_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.shopping_trips (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id),
  member_id uuid references public.members(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.shopping_extras (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  qty text,
  shop_id uuid references public.shops(id),
  for_meal_slot_id uuid,
  bought_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.trip_lines (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.shopping_trips(id),
  item_id uuid references public.stock_items(id),
  extra_id uuid references public.shopping_extras(id),
  qty_bought numeric,
  ticked_at timestamptz,
  not_found boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  due_on date,
  repeat text not null default 'none' check (repeat in ('none','daily','weekly','monthly','quarterly','when_low')),
  series_id uuid,
  kind text not null default 'job' check (kind in ('job','help')),
  claimed_by uuid references public.members(id),
  claimed_at timestamptz,
  done_by uuid references public.members(id),
  done_at timestamptz,
  needs_volunteer_since timestamptz,
  from_decision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.thanks (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('job','meal','money','other')),
  target_id uuid,
  to_member uuid not null references public.members(id),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

-- Insert-only. A correction is a new entry with voids_entry_id set.
create table public.money_entries (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in','out')),
  occurred_on date not null default current_date,
  amount_kes numeric not null check (amount_kes > 0),
  method text check (method in ('mpesa','bank','cash','other')),
  spent_by uuid references public.members(id),
  shop_id uuid references public.shops(id),
  category_id uuid references public.budget_categories(id),
  trip_id uuid references public.shopping_trips(id),
  note text,
  voids_entry_id uuid references public.money_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  category_id uuid not null references public.budget_categories(id),
  amount_kes numeric not null check (amount_kes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create unique index budgets_month_category on public.budgets (month, category_id) where deleted_at is null;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  held_on date,
  host_id uuid references public.members(id),
  notes text,
  status text not null default 'planned' check (status in ('planned','held')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id),
  title text not null,
  minutes int,
  source text not null default 'manual' check (source in ('manual','template','waiting_job','help')),
  source_job_id uuid references public.jobs(id),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id),
  decided_on date not null default current_date,
  text text not null,
  job_id uuid references public.jobs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id),
  item_id uuid references public.stock_items(id),
  name text,
  qty text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.meal_slots (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  slot text not null check (slot in ('breakfast','lunch','supper')),
  meal_id uuid references public.meals(id),
  custom_name text,
  everyone_out boolean not null default false,
  cook_id uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);
create unique index meal_slots_day_slot on public.meal_slots (day, slot) where deleted_at is null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  phone text,
  area text,
  note text,
  is_emergency boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

-- Feed for Home and push alerts. Insert-only.
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ref_table text,
  ref_id uuid,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid references public.members(id)
);

-- Every change: what, before, after, who, which phone. Written by trigger only.
create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  table_name text not null,
  row_id uuid,
  op text not null,
  old jsonb,
  new jsonb,
  actor_id uuid,
  device_id uuid
);
create index audit_log_row on public.audit_log (table_name, row_id);

-- Mutation ids already applied, so a change sent twice counts once.
create table public.applied_mutations (
  id uuid primary key,
  device_id uuid default auth.uid(),
  applied_at timestamptz not null default now()
);

-- Indexes for pulling changes since a cursor.
do $$
declare t text;
begin
  foreach t in array array[
    'members','settings','shops','stock_items','stock_movements','shopping_trips','shopping_extras',
    'trip_lines','jobs','thanks','budget_categories','money_entries','budgets','meetings','agenda_items',
    'decisions','meals','meal_ingredients','meal_slots','contacts','activity','push_subscriptions','devices'
  ] loop
    execute format('create index %I on public.%I (updated_at)', t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- triggers

-- Server sets updated_at and actor_id; created_at can't be changed.
create function public.set_row_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  if auth.uid() is not null then
    new.actor_id := public.current_member_id();
  end if;
  return new;
end;
$$;

create function public.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (table_name, row_id, op, old, new, actor_id, device_id)
  values (
    tg_table_name,
    new.id,
    lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new),
    new.actor_id,
    auth.uid()
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'members','settings','shops','stock_items','stock_movements','shopping_trips','shopping_extras',
    'trip_lines','jobs','thanks','budget_categories','money_entries','budgets','meetings','agenda_items',
    'decisions','meals','meal_ingredients','meal_slots','contacts','activity','push_subscriptions'
  ] loop
    execute format('create trigger set_row_meta before insert or update on public.%I for each row execute function public.set_row_meta()', t);
    execute format('create trigger write_audit after insert or update on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- what phones may change

-- Columns each table accepts from phones. Everything else is set by the server
-- (actor_id, updated_at), by trigger (have_qty), or by a checked function (job and cooking claims).
create function public.mutation_allowlist() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "shops":            {"insert_only": false, "cols": ["id","name","kind","sort"]},
    "stock_items":      {"insert_only": false, "cols": ["id","name","category","unit","min_qty","usual_price_kes","shop_id","track_mode","level","sort"]},
    "stock_movements":  {"insert_only": true,  "cols": ["id","item_id","delta","reason","trip_id"]},
    "shopping_trips":   {"insert_only": false, "cols": ["id","shop_id","member_id","started_at","finished_at"]},
    "shopping_extras":  {"insert_only": false, "cols": ["id","title","qty","shop_id","for_meal_slot_id","bought_at"]},
    "trip_lines":       {"insert_only": false, "cols": ["id","trip_id","item_id","extra_id","qty_bought","ticked_at","not_found"]},
    "jobs":             {"insert_only": false, "cols": ["id","title","notes","due_on","repeat","series_id","kind","done_by","done_at","from_decision_id"]},
    "thanks":           {"insert_only": true,  "cols": ["id","target_type","target_id","to_member","message"]},
    "budget_categories":{"insert_only": false, "cols": ["id","name","sort"]},
    "money_entries":    {"insert_only": true,  "cols": ["id","direction","occurred_on","amount_kes","method","spent_by","shop_id","category_id","trip_id","note","voids_entry_id"]},
    "budgets":          {"insert_only": false, "cols": ["id","month","category_id","amount_kes"]},
    "meetings":         {"insert_only": false, "cols": ["id","held_on","host_id","notes","status"]},
    "agenda_items":     {"insert_only": false, "cols": ["id","meeting_id","title","minutes","source","source_job_id","sort"]},
    "decisions":        {"insert_only": false, "cols": ["id","meeting_id","decided_on","text","job_id"]},
    "meals":            {"insert_only": false, "cols": ["id","name"]},
    "meal_ingredients": {"insert_only": false, "cols": ["id","meal_id","item_id","name","qty"]},
    "meal_slots":       {"insert_only": false, "cols": ["id","day","slot","meal_id","custom_name","everyone_out"]},
    "contacts":         {"insert_only": false, "cols": ["id","name","role","phone","area","note","is_emergency","sort"]},
    "activity":         {"insert_only": true,  "cols": ["id","kind","ref_table","ref_id","summary"]}
  }'::jsonb;
$$;

-- ---------------------------------------------------------------- row level security and grants

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'members','devices','auth_failures','settings','shops','stock_items','stock_movements','shopping_trips',
    'shopping_extras','trip_lines','jobs','thanks','budget_categories','money_entries','budgets','meetings',
    'agenda_items','decisions','meals','meal_ingredients','meal_slots','contacts','activity',
    'push_subscriptions','audit_log','applied_mutations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Read access for unlocked phones with a member.
do $$
declare t text;
begin
  foreach t in array array[
    'members','devices','settings','shops','stock_items','stock_movements','shopping_trips','shopping_extras',
    'trip_lines','jobs','thanks','budget_categories','money_entries','budgets','meetings','agenda_items',
    'decisions','meals','meal_ingredients','meal_slots','contacts','activity','audit_log'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy household_read on public.%I for select to authenticated using (public.is_household())', t);
  end loop;
end $$;

-- An unlocked phone that hasn't picked a name yet can see the list of names.
create policy device_read_members on public.members for select to authenticated using (public.is_device());

-- Write access: column-level grants from the allowlist, insert for all, update only for non insert-only tables.
do $$
declare
  t text;
  spec jsonb;
  cols text;
  upd_cols text;
begin
  for t, spec in select key, value from jsonb_each(public.mutation_allowlist()) loop
    select string_agg(format('%I', c), ', ') into cols from jsonb_array_elements_text(spec->'cols') c;
    execute format('grant insert (%s) on public.%I to authenticated', cols, t);
    execute format('create policy household_insert on public.%I for insert to authenticated with check (public.is_household())', t);
    if not (spec->>'insert_only')::boolean then
      select string_agg(format('%I', c), ', ') into upd_cols
        from jsonb_array_elements_text(spec->'cols') c where c <> 'id';
      execute format('grant update (%s, deleted_at) on public.%I to authenticated', upd_cols, t);
      execute format('create policy household_update on public.%I for update to authenticated using (public.is_household()) with check (public.is_household())', t);
    end if;
  end loop;
end $$;

grant select, insert on public.applied_mutations to authenticated;
create policy household_read on public.applied_mutations for select to authenticated using (public.is_household());
create policy household_insert on public.applied_mutations for insert to authenticated with check (public.is_household());

-- push_subscriptions are managed in Phase 7.

-- ---------------------------------------------------------------- sync entry point

-- Applies a batch of changes from one phone. Runs with the caller's permissions, so
-- row rules and column grants still apply. Each change is applied or rejected on its own.
-- mutation: {"id": uuid, "table": text, "op": "insert"|"update"|"delete", "row": {...}}
create function public.apply_mutations(mutations jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  m jsonb;
  mid uuid;
  tbl text;
  op text;
  r jsonb;
  spec jsonb;
  cols text[];
  col_list text;
  set_list text;
  n int;
  applied jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
begin
  if not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;

  for m in select value from jsonb_array_elements(mutations) loop
    begin
      mid := (m->>'id')::uuid;
      tbl := m->>'table';
      op := m->>'op';
      r := coalesce(m->'row', '{}'::jsonb);
      spec := public.mutation_allowlist()->tbl;

      if mid is null then
        raise exception 'change has no id';
      end if;
      if spec is null then
        raise exception 'this kind of change is not allowed (%)', coalesce(tbl, 'no table');
      end if;
      if r->>'id' is null then
        raise exception 'row has no id';
      end if;

      insert into public.applied_mutations (id) values (mid) on conflict (id) do nothing;
      if not found then
        applied := applied || to_jsonb(mid);  -- sent before; already applied
        continue;
      end if;

      select array_agg(c) into cols
        from jsonb_array_elements_text(spec->'cols') c
       where r ? c;

      if op = 'insert' then
        select string_agg(format('%I', c), ', ') into col_list from unnest(cols) c;
        execute format(
          'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing',
          tbl, col_list, col_list, tbl
        ) using r;

      elsif op = 'update' then
        if (spec->>'insert_only')::boolean then
          raise exception 'entries in % can''t be changed; add a correction instead', tbl;
        end if;
        select string_agg(format('%I = src.%I', c, c), ', ') into set_list
          from unnest(cols) c where c <> 'id';
        if set_list is null then
          raise exception 'nothing to change';
        end if;
        execute format(
          'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) src where t.id = ($1->>''id'')::uuid and t.deleted_at is null',
          tbl, set_list, tbl
        ) using r;
        get diagnostics n = row_count;
        if n = 0 then
          raise exception 'that item no longer exists';
        end if;

      elsif op = 'delete' then
        if (spec->>'insert_only')::boolean then
          raise exception 'entries in % can''t be removed; add a correction instead', tbl;
        end if;
        execute format(
          'update public.%I set deleted_at = now() where id = ($1->>''id'')::uuid and deleted_at is null',
          tbl
        ) using r;

      else
        raise exception 'unknown change type %', coalesce(op, 'none');
      end if;

      applied := applied || to_jsonb(mid);
    exception when others then
      rejected := rejected || jsonb_build_object('id', mid, 'reason', sqlerrm);
    end;
  end loop;

  update public.devices set last_seen_at = now() where id = auth.uid();

  return jsonb_build_object('applied', applied, 'rejected', rejected);
end;
$$;

-- devices.last_seen_at is touched above with the caller's rights; allow just that column.
grant update (last_seen_at) on public.devices to authenticated;
create policy own_device_touch on public.devices for update to authenticated
  using (id = auth.uid() and revoked_at is null) with check (id = auth.uid());

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_device(), public.is_household(), public.current_member_id(),
  public.set_device_member(uuid), public.apply_mutations(jsonb), public.mutation_allowlist() to authenticated;
