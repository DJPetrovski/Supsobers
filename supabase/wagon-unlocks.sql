-- Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.wagon_unlocks (
  session_id text primary key,
  code text unique not null,
  uses int not null default 1,
  amount_cents int not null default 0,
  live boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.wagon_unlocks enable row level security;
-- no policies on purpose: only the Edge Function (service role) can read or write this table.
