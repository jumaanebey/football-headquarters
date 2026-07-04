-- Football Headquarters — Live Rivals (async PvP) schema.
-- Run this in your Supabase project's SQL editor, then set the two VITE_ env vars
-- (see PVP-SETUP.md). Prototype-tier security: anonymous honor-system writes gated
-- only by RLS shape — fine for a friends-and-family beta, NOT for open production.

create table if not exists fhq_bases (
  pid        text primary key,
  name       text not null,
  trophies   int  not null default 0,
  layout     jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists fhq_attacks (
  id            bigint generated always as identity primary key,
  target_pid    text not null,
  attacker_name text not null,
  stars         int  not null,
  pct           int  not null,
  coins_lost    int  not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists fhq_attacks_target on fhq_attacks (target_pid, created_at);

alter table fhq_bases   enable row level security;
alter table fhq_attacks enable row level security;

create policy "bases: public read"    on fhq_bases   for select using (true);
create policy "bases: public insert"  on fhq_bases   for insert with check (true);
create policy "bases: public update"  on fhq_bases   for update using (true);
create policy "attacks: public read"  on fhq_attacks for select using (true);
create policy "attacks: public write" on fhq_attacks for insert with check (true);
