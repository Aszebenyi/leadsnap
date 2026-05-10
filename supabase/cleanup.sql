-- LeadSnap — 90-day lead cleanup
-- Run this in the Supabase SQL editor (one-time setup).
--
-- Prerequisites: pg_cron must be enabled for your Supabase project.
-- Enable it at: Dashboard → Database → Extensions → pg_cron
--
-- What this does:
--   • Creates a cleanup function that deletes leads (and their cascade-linked alerts)
--     that are older than 90 days, as promised in the Privacy Policy.
--   • Schedules the function to run nightly at 03:00 UTC.
--   • Adds a performance index on leads.detected_at for fast range scans.

-- ============================================================
-- 1. INDEX — fast range scans on detected_at
-- ============================================================

create index if not exists leads_detected_at_idx on leads (detected_at);

-- ============================================================
-- 2. CLEANUP FUNCTION
-- ============================================================

create or replace function cleanup_old_leads()
returns void
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  -- alerts.lead_id has ON DELETE CASCADE, so deleting a lead automatically
  -- removes its associated alert rows — no separate DELETE needed.
  delete from leads
  where detected_at < now() - interval '90 days';

  get diagnostics deleted_count = row_count;

  raise log '[LeadSnap] cleanup_old_leads: deleted % lead(s) older than 90 days', deleted_count;
end;
$$;

-- ============================================================
-- 3. SCHEDULE — nightly at 03:00 UTC via pg_cron
-- ============================================================

-- Remove any existing schedule with the same name before (re-)creating it.
select cron.unschedule('leadsnap-cleanup-old-leads')
where exists (
  select 1 from cron.job where jobname = 'leadsnap-cleanup-old-leads'
);

select cron.schedule(
  'leadsnap-cleanup-old-leads',   -- job name
  '0 3 * * *',                    -- cron expression: every day at 03:00 UTC
  'select cleanup_old_leads()'    -- SQL to run
);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- After running this script, confirm the job is registered:
--   select * from cron.job where jobname = 'leadsnap-cleanup-old-leads';
--
-- To manually test the function (safe — only deletes real 90-day-old rows):
--   select cleanup_old_leads();
--
-- To view recent job runs and any errors:
--   select * from cron.job_run_details
--   where jobname = 'leadsnap-cleanup-old-leads'
--   order by start_time desc
--   limit 10;
--
-- To remove the schedule entirely:
--   select cron.unschedule('leadsnap-cleanup-old-leads');
