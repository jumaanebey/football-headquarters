-- Football Headquarters — FUNNEL READOUT over fhq_events.
-- Read-side companion to 20260713000002_analytics_events.sql. Answers the only
-- questions that matter for marketing: where do coaches drop off, do they come
-- back, and what do they spend gems on.
--
-- SECURITY. fhq_events is write-only to clients (INSERT policy, no SELECT policy).
-- A plain view would BREAK that: views run as their owner (postgres) and bypass RLS,
-- so `select * from fhq_funnel` with the public anon key would leak every event.
-- Two guards, deliberately redundant:
--   1. security_invoker = on  → the view runs as the CALLER, so RLS still applies and
--      anon/authenticated see zero rows (there is no select policy for them).
--   2. explicit revoke        → anon/authenticated can't even reach the view.
-- service_role has BYPASSRLS, so the CLI readout (scripts/funnel.mjs) sees everything.

-- ── 1. Onboarding funnel — unique players reaching each step ──────────────────
-- Steps are ordered by how far into the game they are, not by event time, so the
-- drop-off between rows is the real "where do we lose them" signal.
create or replace view fhq_funnel with (security_invoker = on) as
with c as (
  select
    count(distinct pid) filter (where event = 'session_start')                                  as s1,
    count(distinct pid) filter (where event = 'club_created')                                   as s2,
    count(distinct pid) filter (where event = 'battle_result')                                  as s3,
    count(distinct pid) filter (where event = 'battle_result' and props->>'won'  = 'true')      as s4,
    count(distinct pid) filter (where event = 'base_publish')                                   as s5,
    count(distinct pid) filter (where event = 'battle_result' and props->>'live' = 'true')      as s6,
    count(distinct pid) filter (where event = 'session_start' and props->>'returning' = 'true') as s7
  from fhq_events
),
steps(step, label, players) as (
  select 1, 'Loaded the game',          s1 from c union all
  select 2, 'Created a club',           s2 from c union all
  select 3, 'Finished a battle',        s3 from c union all
  select 4, 'Won a battle',             s4 from c union all
  select 5, 'Published a base',         s5 from c union all
  select 6, 'Raided a live rival',      s6 from c union all
  select 7, 'Came back (2nd session)',  s7 from c
)
select
  step,
  label,
  players,
  -- % of everyone who ever loaded the game (step 1 is the denominator)
  round(100.0 * players / nullif(first_value(players) over (order by step), 0), 1) as pct_of_loaded,
  -- players lost since the previous step (negative = drop-off)
  players - lag(players) over (order by step) as delta_from_prev
from steps
order by step;

-- ── 2. Retention — D1 / D7 by first-seen cohort ───────────────────────────────
create or replace view fhq_retention with (security_invoker = on) as
with first_seen as (
  select pid, min(ts)::date as cohort_day from fhq_events group by pid
),
active as (
  select distinct pid, ts::date as active_day from fhq_events
)
select
  f.cohort_day,
  count(distinct f.pid)                                                        as new_players,
  count(distinct f.pid) filter (where a.active_day = f.cohort_day + 1)         as d1,
  count(distinct f.pid) filter (where a.active_day = f.cohort_day + 7)         as d7,
  round(100.0 * count(distinct f.pid) filter (where a.active_day = f.cohort_day + 1)
        / nullif(count(distinct f.pid), 0), 1)                                 as d1_pct
from first_seen f
left join active a on a.pid = f.pid
group by f.cohort_day
order by f.cohort_day desc;

-- ── 3. Engagement — which systems actually get used ───────────────────────────
create or replace view fhq_engagement with (security_invoker = on) as
select
  event,
  count(*)                                        as events,
  count(distinct pid)                             as players,
  round(count(*)::numeric
        / nullif(count(distinct pid), 0), 1)      as per_player,
  max(ts)                                         as last_seen
from fhq_events
group by event
order by players desc, events desc;

-- ── 4. Gem sinks — what the premium currency is spent on ──────────────────────
-- Only the events that carry a `gems` prop (upgrade_finish_now, builder_hire, slot_buy).
-- The regex guard keeps a malformed prop from breaking the cast.
create or replace view fhq_gem_sinks with (security_invoker = on) as
select
  event                                    as sink,
  count(*)                                 as purchases,
  count(distinct pid)                      as players,
  sum((props->>'gems')::bigint)            as gems_spent
from fhq_events
where props ? 'gems'
  and props->>'gems' ~ '^[0-9]+$'
group by event
order by gems_spent desc;

-- ── 5. Daily actives ──────────────────────────────────────────────────────────
create or replace view fhq_daily as
select
  ts::date                                                    as day,
  count(distinct pid)                                         as players,
  count(distinct session_id)                                  as sessions,
  count(*)                                                    as events,
  count(distinct pid) filter (where event = 'club_created')   as new_clubs
from fhq_events
group by ts::date
order by day desc;
alter view fhq_daily set (security_invoker = on);

-- Guard #2: telemetry stays unreadable to the public keys, view or no view.
revoke all on fhq_funnel, fhq_retention, fhq_engagement, fhq_gem_sinks, fhq_daily
  from anon, authenticated;
grant select on fhq_funnel, fhq_retention, fhq_engagement, fhq_gem_sinks, fhq_daily
  to service_role;
