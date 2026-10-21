-- Push alerts (Phase 7): every 5 minutes the database calls the app's /api/push/tick, which
-- works out who needs an alert and sends it. The URL and shared secret live in Supabase Vault
-- (written by scripts/push-setup.mjs from .env.local), never in this file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.job_participants add column handover_notified_at timestamptz;

-- Leaving a job (or being marked unable) must not look like a handover that needs an alert
-- when it happened before this existed.
update public.job_participants set handover_notified_at = now() where deleted_at is not null;

create function public.push_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_tick_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shared_secret');
begin
  if url is null or secret is null then
    return; -- not set up yet: run scripts/push-setup.mjs
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-notify-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;
revoke execute on function public.push_tick() from public, anon, authenticated;

select cron.schedule('push-tick', '*/5 * * * *', $$ select public.push_tick(); $$);
