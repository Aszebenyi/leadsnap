-- Add alert_channel preference to profiles table
-- Values: 'sms' (default) | 'whatsapp'
-- Run once in Supabase Dashboard → SQL Editor

alter table profiles
  add column if not exists alert_channel text not null default 'sms'
  check (alert_channel in ('sms', 'whatsapp'));
