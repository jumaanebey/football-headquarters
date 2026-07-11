-- ─── FHQ CLOUD SAVES ──────────────────────────────────────────────────────────
-- Run once in the Supabase SQL editor (same project as fhq_bases/fhq_attacks).
-- One row per player; pid = auth uid (anonymous or upgraded account — same uid,
-- so linking an email later keeps the save). RLS: you can only touch YOUR row.

create table if not exists public.fhq_saves (
  pid        uuid primary key references auth.users (id) on delete cascade,
  save       jsonb not null,
  club_name  text,
  club_power integer,
  updated_at timestamptz not null default now(),
  -- saves are ~50-150KB of JSON; 500KB bounds runaway/hostile payloads
  constraint fhq_save_size check (pg_column_size(save) < 500000)
);

alter table public.fhq_saves enable row level security;

drop policy if exists "own save select" on public.fhq_saves;
drop policy if exists "own save insert" on public.fhq_saves;
drop policy if exists "own save update" on public.fhq_saves;
drop policy if exists "own save delete" on public.fhq_saves;

create policy "own save select" on public.fhq_saves for select using (auth.uid() = pid);
create policy "own save insert" on public.fhq_saves for insert with check (auth.uid() = pid);
create policy "own save update" on public.fhq_saves for update using (auth.uid() = pid) with check (auth.uid() = pid);
create policy "own save delete" on public.fhq_saves for delete using (auth.uid() = pid);
