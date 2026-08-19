begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $$
declare
  sync_secret text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  perform vault.create_secret(
    sync_secret,
    'point_sync_cron_secret_v1',
    'Internal header used by scheduled point campaign synchronization'
  );

  insert into public.point_sync_config (singleton, cron_secret_hash, updated_at)
  values (
    true,
    encode(extensions.digest(sync_secret, 'sha256'), 'hex'),
    now()
  )
  on conflict (singleton) do update set
    cron_secret_hash = excluded.cron_secret_hash,
    updated_at = excluded.updated_at;
end;
$$;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in ('point-campaign-sync-0630-jst', 'point-campaign-sync-1015-jst')
  loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'point-campaign-sync-0630-jst',
    '30 21 * * *',
    $request$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'point_sync_project_url')
          || '/functions/v1/sync-point-campaigns',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'point_sync_anon_key'
          ),
          'x-sync-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'point_sync_cron_secret_v1'
          )
        ),
        body := jsonb_build_object('trigger', 'cron', 'requested_at', now()),
        timeout_milliseconds := 30000
      );
    $request$
  );

  perform cron.schedule(
    'point-campaign-sync-1015-jst',
    '15 1 * * *',
    $request$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'point_sync_project_url')
          || '/functions/v1/sync-point-campaigns',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'point_sync_anon_key'
          ),
          'x-sync-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'point_sync_cron_secret_v1'
          )
        ),
        body := jsonb_build_object('trigger', 'cron', 'requested_at', now()),
        timeout_milliseconds := 30000
      );
    $request$
  );
end;
$$;

commit;
