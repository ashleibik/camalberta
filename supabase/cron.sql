-- CamAlberta's schedule, run by Supabase itself (pg_cron + pg_net). GitHub
-- Actions schedules turned out unreliable for a new repo (hours between runs).
--
--   :00 :15 :30 :45  POST /api/sync     (cameras + Trip Check's 511 data)
--   :05 :20 :35 :50  POST /api/collect  (road condition snapshots; answers
--                                        503 until the R2 bucket is set up)
--
-- Both send `Authorization: Bearer <CRON_SECRET>`. The secret lives in
-- Supabase Vault (encrypted), never in this file or in the job definitions:
-- each job reads it when it runs.
--
-- Setup, in the Supabase SQL editor (or any session-pooler connection):
--
-- 1. Store the secret once (paste the real value; never commit it):
--      select vault.create_secret('<CRON_SECRET>', 'camalberta_cron_secret',
--        'Bearer token for CamAlberta /api/sync and /api/collect');
--    To change it later (also change CRON_SECRET in Vercel and redeploy):
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'camalberta_cron_secret'),
--        '<new CRON_SECRET>');
--
-- 2. Run this file. Safe to run again: it replaces the jobs, never adds
--    duplicates.
--
-- Check that it runs:
--   select jobname, status, start_time from cron.job_run_details
--     order by start_time desc limit 10;
--   select created, status_code from net._http_response
--     order by created desc limit 10;
-- Stop it:  select cron.unschedule('camalberta-sync');
--           select cron.unschedule('camalberta-collect');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname)
from cron.job
where jobname in ('camalberta-sync', 'camalberta-collect');

select cron.schedule(
  'camalberta-sync',
  '0,15,30,45 * * * *',
  $job$
  select net.http_post(
    url := 'https://camalberta.vercel.app/api/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'camalberta_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  )
  $job$
);

select cron.schedule(
  'camalberta-collect',
  '5,20,35,50 * * * *',
  $job$
  select net.http_post(
    url := 'https://camalberta.vercel.app/api/collect',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'camalberta_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  )
  $job$
);
