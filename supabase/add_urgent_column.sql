-- Add urgent flag to leads table
-- Run this once in Supabase Dashboard → SQL Editor

alter table leads add column if not exists urgent boolean not null default false;
