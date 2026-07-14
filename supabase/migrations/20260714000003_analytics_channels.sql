-- Which channel produced PLAYERS, not just clicks.
-- Tag shared links (?src=reddit, ?src=ig, ?src=hn) — trafficSource() in analytics.ts
-- records it on that player's first session_start, and this view carries the source
-- forward through every later step, so a launch post is judged on players who actually
-- played and came back, not on raw traffic.
create or replace view fhq_channels with (security_invoker = on) as
with first_touch as (
  select distinct on (pid)
    pid,
    coalesce(nullif(props->>'source', ''), 'direct') as source,
    ts
  from fhq_events_clean
  where event = 'session_start'
  order by pid, ts asc
)
select
  f.source,
  count(distinct f.pid)                                                                        as players,
  count(distinct e.pid) filter (where e.event = 'club_created')                                as created_club,
  count(distinct e.pid) filter (where e.event = 'battle_result')                               as played_a_game,
  count(distinct e.pid) filter (where e.event = 'battle_result' and e.props->>'won' = 'true')  as won_a_game,
  count(distinct e.pid) filter (where e.event = 'session_start' and e.props->>'returning' = 'true') as came_back,
  round(100.0 * count(distinct e.pid) filter (where e.event = 'battle_result')
        / nullif(count(distinct f.pid), 0), 1)                                                 as pct_reached_a_game
from first_touch f
left join fhq_events_clean e on e.pid = f.pid
group by f.source
order by players desc;

revoke all on fhq_channels from anon, authenticated;
grant select on fhq_channels to service_role;
