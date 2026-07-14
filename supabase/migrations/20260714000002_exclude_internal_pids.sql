-- Keep internal play (Jumaane's own devices) out of the product metrics.
-- Raw events are still recorded — fhq_events is untouched. Every READ path filters
-- excluded pids out, so the funnel reflects real players only.
--
-- To exclude another device (phone, second browser), get its pid from the browser
-- console on the live site:   localStorage.getItem('fhq_pid')
-- then:  insert into fhq_excluded_pids (pid, note) values ('<pid>', 'iPhone');
-- Every view updates at once — no migration needed.

create table if not exists fhq_excluded_pids (
  pid      text primary key,
  note     text,
  added_at timestamptz not null default now()
);

-- Same posture as fhq_events: internal-only. RLS on with no policy + explicit revoke
-- means anon/authenticated can neither read nor write it; service_role bypasses RLS.
alter table fhq_excluded_pids enable row level security;
revoke all on fhq_excluded_pids from anon, authenticated;
grant select, insert, delete on fhq_excluded_pids to service_role;

insert into fhq_excluded_pids (pid, note)
values ('88de63dd-421e-47ec-be62-a30fdeafc946', 'Jumaane — Chrome dev/test device')
on conflict (pid) do nothing;

-- The single place the exclusion is applied. Every metric view reads from this rather
-- than fhq_events, so adding one pid here cleans up all five views at once.
create or replace view fhq_events_clean with (security_invoker = on) as
select e.*
from fhq_events e
where not exists (select 1 from fhq_excluded_pids x where x.pid = e.pid);

-- ── metric views, rebuilt on the filtered source ─────────────────────────────
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
  from fhq_events_clean
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
  round(100.0 * players / nullif(first_value(players) over (order by step), 0), 1) as pct_of_loaded,
  players - lag(players) over (order by step) as delta_from_prev
from steps
order by step;

create or replace view fhq_retention with (security_invoker = on) as
with first_seen as (
  select pid, min(ts)::date as cohort_day from fhq_events_clean group by pid
),
active as (
  select distinct pid, ts::date as active_day from fhq_events_clean
)
select
  f.cohort_day,
  count(distinct f.pid)                                                as new_players,
  count(distinct f.pid) filter (where a.active_day = f.cohort_day + 1) as d1,
  count(distinct f.pid) filter (where a.active_day = f.cohort_day + 7) as d7,
  round(100.0 * count(distinct f.pid) filter (where a.active_day = f.cohort_day + 1)
        / nullif(count(distinct f.pid), 0), 1)                         as d1_pct
from first_seen f
left join active a on a.pid = f.pid
group by f.cohort_day
order by f.cohort_day desc;

create or replace view fhq_engagement with (security_invoker = on) as
select
  event,
  count(*)                                                     as events,
  count(distinct pid)                                          as players,
  round(count(*)::numeric / nullif(count(distinct pid), 0), 1) as per_player,
  max(ts)                                                      as last_seen
from fhq_events_clean
group by event
order by players desc, events desc;

create or replace view fhq_gem_sinks with (security_invoker = on) as
select
  event                         as sink,
  count(*)                      as purchases,
  count(distinct pid)           as players,
  sum((props->>'gems')::bigint) as gems_spent
from fhq_events_clean
where props ? 'gems'
  and props->>'gems' ~ '^[0-9]+$'
group by event
order by gems_spent desc;

create or replace view fhq_daily with (security_invoker = on) as
select
  ts::date                                                  as day,
  count(distinct pid)                                       as players,
  count(distinct session_id)                                as sessions,
  count(*)                                                  as events,
  count(distinct pid) filter (where event = 'club_created') as new_clubs
from fhq_events_clean
group by ts::date
order by day desc;

revoke all on fhq_events_clean, fhq_funnel, fhq_retention, fhq_engagement, fhq_gem_sinks, fhq_daily
  from anon, authenticated;
grant select on fhq_events_clean, fhq_funnel, fhq_retention, fhq_engagement, fhq_gem_sinks, fhq_daily
  to service_role;
