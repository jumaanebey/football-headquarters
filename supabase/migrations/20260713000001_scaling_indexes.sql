-- Football Headquarters — SCALING: indexes + attack-log retention.
-- The two hottest read paths (matchmaking + leaderboard) filtered/sorted fhq_bases
-- on `trophies` with only a pid primary key → a full table scan on every raid-screen
-- open. At friends-and-family scale that's invisible; at thousands of bases it's the
-- first wall we hit. These indexes make both paths index scans.

-- Matchmaking: findOpponents() range-filters `trophies=gte.lo&trophies=lte.hi`.
-- Leaderboard: fetchLeaderboard() sorts `order=trophies.desc,updated_at.desc`.
-- One composite covers both (the range filter uses the leading column; the ORDER BY
-- matches the full ordering).
create index if not exists fhq_bases_trophies
  on fhq_bases (trophies desc, updated_at desc);

-- fhq_attacks is append-only with an 80KB replay blob per row and no cleanup — it
-- grows forever. A defender only ever reads attacks since their last sync, and the
-- defense log keeps at most the newest 20, so attack rows older than 30 days are dead
-- weight. Reclaim them nightly. (pg_cron ships with Supabase; enable once per project.)
create extension if not exists pg_cron;

select cron.schedule(
  'fhq_attacks_ttl',
  '17 4 * * *', -- 04:17 UTC daily, off-peak
  $$delete from fhq_attacks where created_at < now() - interval '30 days'$$
);
