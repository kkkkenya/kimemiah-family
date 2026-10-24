-- A job already done, logged afterwards: what, when, how long, and who did how much (shares add up
-- to 100%). It goes straight onto the board as done, so it counts toward each person's time given
-- like any other job. Shares are checked here, since job_participants can't be written directly.

create function public.log_done_job(
  p_title text,
  p_category text,
  p_strain text,
  p_duration int,
  p_done_at timestamptz,
  p_shares jsonb, -- [{"member_id": "...", "pct": 85}, ...]
  p_template text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  job_id uuid;
  total int;
  people int;
  top uuid;
begin
  if me is null or not public.is_household() then
    raise exception 'this phone is not unlocked' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'say what the job was'; end if;
  if p_done_at is null or p_done_at > now() + interval '5 minutes' then raise exception 'pick when it was done'; end if;
  if p_done_at < now() - interval '60 days' then raise exception 'only jobs from the last 60 days can be logged'; end if;

  select coalesce(sum((s->>'pct')::int), 0), count(distinct s->>'member_id')
    into total, people
    from jsonb_array_elements(p_shares) s;
  if people <> jsonb_array_length(p_shares) then raise exception 'each person once'; end if;
  if people < 1 or people > 4 then raise exception 'pick 1 to 4 people'; end if;
  if total <> 100 then raise exception '%', format('the shares add up to %s%%, not 100%%', total); end if;
  if exists (select 1 from jsonb_array_elements(p_shares) s where (s->>'pct')::int < 5 or (s->>'pct')::int > 100) then
    raise exception 'each share is between 5%% and 100%%';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shares) s
              where not exists (select 1 from public.members m where m.id = (s->>'member_id')::uuid)) then
    raise exception 'someone in the list is not in the family';
  end if;

  select (s->>'member_id')::uuid into top from jsonb_array_elements(p_shares) s order by (s->>'pct')::int desc limit 1;

  insert into public.jobs (title, category, strain, duration_min, people_needed, template_key, started_at, done_at, done_by, due_at)
  values (trim(p_title), p_category, p_strain, p_duration, people, p_template, p_done_at - make_interval(mins => p_duration), p_done_at, top, p_done_at)
  returning id into job_id;

  insert into public.job_participants (job_id, member_id, effort_pct, role_note, status)
  select job_id, (s->>'member_id')::uuid, (s->>'pct')::int, 'Logged after', 'active'
    from jsonb_array_elements(p_shares) s;

  return job_id;
end;
$$;
revoke execute on function public.log_done_job(text, text, text, int, timestamptz, jsonb, text) from public, anon;
grant execute on function public.log_done_job(text, text, text, int, timestamptz, jsonb, text) to authenticated;
