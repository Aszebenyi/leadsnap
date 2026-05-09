-- LeadSnap Schema
-- Run this in the Supabase SQL editor for your project.
-- The `auth.users` table is managed by Supabase Auth — do not create it manually.

-- ============================================================
-- TABLES
-- ============================================================

create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  business_name text,
  service_description text,
  phone_number text,
  timezone text default 'UTC',
  onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text default 'trial',  -- trial | active | cancelled | past_due
  plan text default 'pro',
  trial_ends_at timestamptz default (now() + interval '7 days'),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  keyword text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  facebook_group_url text not null,
  group_name text,
  active boolean default true,
  last_scanned_at timestamptz,
  created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  post_text text not null,
  post_url text,
  author_name text,
  group_name text,
  group_url text,
  score integer check (score >= 1 and score <= 10),
  ai_reply text,
  status text default 'new' check (status in ('new', 'seen', 'replied', 'won', 'lost')),
  matched_keywords text[],
  detected_at timestamptz default now(),
  notified_at timestamptz,
  created_at timestamptz default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete cascade not null,
  channel text default 'sms',
  sent_at timestamptz default now(),
  delivered boolean default false,
  twilio_sid text
);

-- ============================================================
-- INDEXES
-- ============================================================

create index leads_user_id_created_at_idx on leads (user_id, created_at desc);
create index leads_status_idx on leads (user_id, status);
create index keywords_user_id_idx on keywords (user_id);
create index groups_user_id_idx on groups (user_id);
create index subscriptions_user_id_idx on subscriptions (user_id);
create index subscriptions_stripe_customer_id_idx on subscriptions (stripe_customer_id);
create index alerts_user_id_idx on alerts (user_id);
create index alerts_lead_id_idx on alerts (lead_id);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function handle_updated_at();

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE + SUBSCRIPTION ON SIGNUP
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id)
  values (new.id);

  insert into subscriptions (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- TRIAL GROUP LIMIT (DB-level enforcement to prevent race conditions)
-- ============================================================

create or replace function enforce_trial_group_limit()
returns trigger as $$
declare
  sub_status text;
  sub_trial_ends_at timestamptz;
  group_count integer;
begin
  select status, trial_ends_at
    into sub_status, sub_trial_ends_at
    from subscriptions
    where user_id = new.user_id;

  if sub_status = 'trial' and sub_trial_ends_at > now() then
    select count(*) into group_count
      from groups
      where user_id = new.user_id;

    if group_count >= 5 then
      raise exception 'Trial plan is limited to 5 groups';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger check_trial_group_limit
  before insert on groups
  for each row execute function enforce_trial_group_limit();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table keywords enable row level security;
alter table groups enable row level security;
alter table leads enable row level security;
alter table alerts enable row level security;

-- profiles
create policy "users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- subscriptions
create policy "users can view own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);

-- keywords
create policy "users can view own keywords"
  on keywords for select
  using (auth.uid() = user_id);

create policy "users can insert own keywords"
  on keywords for insert
  with check (auth.uid() = user_id);

create policy "users can delete own keywords"
  on keywords for delete
  using (auth.uid() = user_id);

create policy "users can update own keywords"
  on keywords for update
  using (auth.uid() = user_id);

-- groups
create policy "users can view own groups"
  on groups for select
  using (auth.uid() = user_id);

create policy "users can insert own groups"
  on groups for insert
  with check (auth.uid() = user_id);

create policy "users can delete own groups"
  on groups for delete
  using (auth.uid() = user_id);

create policy "users can update own groups"
  on groups for update
  using (auth.uid() = user_id);

-- leads
create policy "users can view own leads"
  on leads for select
  using (auth.uid() = user_id);

create policy "users can insert own leads"
  on leads for insert
  with check (auth.uid() = user_id);

create policy "users can update own leads"
  on leads for update
  using (auth.uid() = user_id);

-- alerts
create policy "users can view own alerts"
  on alerts for select
  using (auth.uid() = user_id);

create policy "users can insert own alerts"
  on alerts for insert
  with check (auth.uid() = user_id);
