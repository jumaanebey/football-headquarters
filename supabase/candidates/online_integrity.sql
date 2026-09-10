-- REVIEW CANDIDATE ONLY: not applied and deliberately outside migrations/.
-- The existing Football project is INACTIVE and restore was inaccessible.
-- First inspect its actual schema, then create a CLI-generated migration, run
-- advisors, and test two disposable identities before production application.
-- This adds delivery idempotency and concurrency stamps; it does NOT validate
-- battle scores or make client-generated club progression authoritative.
-- Existing rows, saves, identities, and published bases are preserved.

begin;

alter table public.fhq_attacks add column if not exists operation_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.fhq_attacks'::regclass and conname = 'fhq_attacks_operation_once') then
    alter table public.fhq_attacks add constraint fhq_attacks_operation_once unique (attacker_pid, operation_id);
  end if;
end $$;

-- PostgREST INSERT ... ON CONFLICT DO NOTHING acknowledges one durable operation.
-- Null operation keys retain compatibility with existing clients and old rows.
-- Clients must never retry an ambiguous legacy insert as a new keyed operation.
grant select on public.fhq_attacks to anon, authenticated;
grant insert on public.fhq_attacks to authenticated;
alter table public.fhq_attacks enable row level security;

-- Serialize each attacker's rate check; clients cannot backdate new reports.
-- A duplicate operation may pass through to DO NOTHING without consuming a slot.
-- RLS continues to validate target existence, signed ownership, and self-attacks.
create or replace function public.fhq_attack_rate_ok() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or new.attacker_pid is distinct from auth.uid()::text then
    raise exception using errcode = '42501', message = 'Attack identity does not match the signed-in account';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.attacker_pid, 0));
  new.created_at := pg_catalog.clock_timestamp();
  if new.operation_id is not null and exists (
    select 1 from public.fhq_attacks where attacker_pid = new.attacker_pid and operation_id = new.operation_id
  ) then return new; end if;
  if (select count(*) from public.fhq_attacks where attacker_pid = new.attacker_pid and created_at > pg_catalog.now() - interval '1 minute') >= 4 then
    raise exception using errcode = 'P0001', message = 'rate limit: too many attacks this minute';
  end if;
  if (select count(*) from public.fhq_attacks where attacker_pid = new.attacker_pid and created_at > pg_catalog.now() - interval '1 hour') >= 30 then
    raise exception using errcode = 'P0001', message = 'rate limit: too many attacks this hour';
  end if;
  return new;
end $$;
revoke all on function public.fhq_attack_rate_ok() from public, anon, authenticated;
drop trigger if exists fhq_attacks_rate on public.fhq_attacks;
create trigger fhq_attacks_rate before insert on public.fhq_attacks for each row execute function public.fhq_attack_rate_ok();

-- Honest concurrent devices compare the accepted old updated_at in the PATCH
-- predicate. The server owns the next stamp and guarantees that it changes even
-- when two commits share a clock microsecond. No data rewrite/backfill is needed.
create or replace function public.fhq_stamp_cloud_save() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or new.pid is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Save identity does not match the signed-in account';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond');
  else new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end $$;
revoke all on function public.fhq_stamp_cloud_save() from public, anon, authenticated;
drop trigger if exists fhq_saves_stamp on public.fhq_saves;
create trigger fhq_saves_stamp before insert or update on public.fhq_saves for each row execute function public.fhq_stamp_cloud_save();

alter table public.fhq_saves enable row level security;
grant select, insert, update, delete on public.fhq_saves to authenticated;
drop policy if exists "own save select" on public.fhq_saves;
drop policy if exists "own save insert" on public.fhq_saves;
drop policy if exists "own save update" on public.fhq_saves;
drop policy if exists "own save delete" on public.fhq_saves;
create policy "own save select" on public.fhq_saves for select to authenticated using ((select auth.uid()) = pid);
create policy "own save insert" on public.fhq_saves for insert to authenticated with check ((select auth.uid()) = pid);
create policy "own save update" on public.fhq_saves for update to authenticated using ((select auth.uid()) = pid) with check ((select auth.uid()) = pid);
create policy "own save delete" on public.fhq_saves for delete to authenticated using ((select auth.uid()) = pid);

drop policy if exists "bases: own update" on public.fhq_bases;
create policy "bases: own update" on public.fhq_bases for update to authenticated
  using (pid = (select auth.uid())::text) with check (pid = (select auth.uid())::text);

commit;
