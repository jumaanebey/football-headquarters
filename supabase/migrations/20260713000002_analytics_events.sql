-- Football Headquarters — PRODUCT ANALYTICS (privacy-light funnel telemetry).
-- Write-only from clients: anonymous devices INSERT events; only the service role
-- (your dashboard / SQL editor) can read them back. No PII is stored — just the
-- anonymous device pid, a per-load session id, an event name, and a small props bag.

create table if not exists fhq_events (
  id         bigint generated always as identity primary key,
  pid        text not null,
  session_id text not null,
  event      text not null,
  props      jsonb not null default '{}'::jsonb,
  ts         timestamptz not null default now()
);

-- Query patterns are "events of type X over a time window" and "funnel by session".
create index if not exists fhq_events_event_ts on fhq_events (event, ts);
create index if not exists fhq_events_session  on fhq_events (session_id);

alter table fhq_events enable row level security;

-- Anyone (anon key) may INSERT, but the payload is bounded so the endpoint can't be
-- abused to store large blobs. There is deliberately NO select policy: clients can
-- write telemetry but never read anyone's events — you read via the service role.
create policy "events: public bounded insert" on fhq_events
  for insert
  with check (
    char_length(event) between 1 and 64
    and char_length(pid) between 1 and 64
    and char_length(session_id) between 1 and 64
    and pg_column_size(props) < 4000
  );

-- Reclaim old raw events nightly (keep 90 days of history for retention cohorts).
-- pg_cron ships with Supabase; the scaling migration already enabled the extension.
create extension if not exists pg_cron;
select cron.schedule(
  'fhq_events_ttl',
  '23 4 * * *', -- 04:23 UTC daily, off-peak
  $$delete from fhq_events where ts < now() - interval '90 days'$$
);
