-- ─────────────────────────────────────────────────────────────────────────────
-- LeadSnap — Migration 01: Performance indexes + 90-day lead cleanup
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary dashboard query: fetch leads for a user ordered by created_at
create index if not exists leads_user_id_created_at_idx
  on leads (user_id, created_at desc);

-- Status filter queries (Dashboard tabs)
create index if not exists leads_user_id_status_idx
  on leads (user_id, status);

-- ── 90-day lead cleanup (pg_cron) ────────────────────────────────────────────
-- Requires the pg_cron extension to be enabled in Supabase.
-- Enable it via: Dashboard → Database → Extensions → pg_cron
--
-- This job runs every day at 03:00 UTC and deletes leads older than 90 days.
-- This fulfils the Privacy Policy promise: "leads are retained for 90 days".

select cron.schedule(
  'leadsnap-delete-old-leads',         -- job name (unique)
  '0 3 * * *',                         -- daily at 03:00 UTC
  $$
    delete from leads
    where created_at < now() - interval '90 days';
  $$
);
