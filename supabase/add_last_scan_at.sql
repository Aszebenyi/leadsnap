-- Add last_scan_at to profiles table for dashboard "extension not connected" warning
-- Run once in Supabase Dashboard → SQL Editor

alter table profiles add column if not exists last_scan_at timestamptz;
