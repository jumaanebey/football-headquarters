-- Football Headquarters — PvP HARDENING.
-- Replaces the honor-system prototype policies with real security:
--   • Identity: anonymous Supabase Auth — pid IS your auth uid; only YOU can write your base.
--   • Sanity constraints: trophies/stars/pct/coins/name/layout are server-bounded.
--   • Attack integrity: attacker identity recorded from the JWT; self-attacks rejected.
--   • Rate limiting: max 4 attack reports/min and 30/hour per attacker (trigger-enforced).
-- Reads stay public (leaderboard + matchmaking are open data).

-- Fresh start: the prototype rows were written by unauthenticated clients and can never
-- be re-keyed to auth identities — drop them. (Friends-and-family scale; clients
-- republish automatically on next load.)
truncate fhq_attacks;
truncate fhq_bases;

-- ── fhq_bases: pid = auth.uid()::text ───────────────────────────────────────
drop policy if exists "bases: public read"   on fhq_bases;
drop policy if exists "bases: public insert" on fhq_bases;
drop policy if exists "bases: public update" on fhq_bases;

alter table fhq_bases
  add constraint fhq_bases_trophies_sane check (trophies between 0 and 20000),
  add constraint fhq_bases_name_len      check (char_length(name) between 1 and 40),
  add constraint fhq_bases_layout_size   check (pg_column_size(layout) < 60000);

create policy "bases: public read" on fhq_bases
  for select using (true);
create policy "bases: own insert" on fhq_bases
  for insert to authenticated with check (pid = (select auth.uid())::text);
create policy "bases: own update" on fhq_bases
  for update to authenticated using (pid = (select auth.uid())::text);

-- ── fhq_attacks: attacker signed by JWT, bounded, rate-limited ──────────────
drop policy if exists "attacks: public read"  on fhq_attacks;
drop policy if exists "attacks: public write" on fhq_attacks;

alter table fhq_attacks add column if not exists attacker_pid text;

alter table fhq_attacks
  add constraint fhq_attacks_stars_sane check (stars between 0 and 3),
  add constraint fhq_attacks_pct_sane   check (pct between 0 and 100),
  add constraint fhq_attacks_coins_sane check (coins_lost between 0 and 100000),
  add constraint fhq_attacks_name_len   check (char_length(attacker_name) between 1 and 40);

create policy "attacks: public read" on fhq_attacks
  for select using (true);
create policy "attacks: own signed insert" on fhq_attacks
  for insert to authenticated
  with check (
    attacker_pid = (select auth.uid())::text     -- you sign your own attacks
    and target_pid <> (select auth.uid())::text  -- no farming your own defense log
    and exists (select 1 from fhq_bases b where b.pid = target_pid) -- target must be real
  );

-- Rate limit: a human plays a raid in ~60s; 4/min + 30/hour per attacker is generous
-- for play and hostile to spam-flooding a victim's defense log.
create or replace function fhq_attack_rate_ok() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from fhq_attacks
      where attacker_pid = new.attacker_pid
        and created_at > now() - interval '1 minute') >= 4 then
    raise exception 'rate limit: too many attacks this minute';
  end if;
  if (select count(*) from fhq_attacks
      where attacker_pid = new.attacker_pid
        and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limit: too many attacks this hour';
  end if;
  return new;
end $$;

drop trigger if exists fhq_attacks_rate on fhq_attacks;
create trigger fhq_attacks_rate before insert on fhq_attacks
  for each row execute function fhq_attack_rate_ok();

create index if not exists fhq_attacks_attacker on fhq_attacks (attacker_pid, created_at);
