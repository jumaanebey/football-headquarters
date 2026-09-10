-- Additive server authority. Existing saves, attacks and analytics are untouched.
-- Browser roles receive neither table privileges nor RPC execution privileges.
create table public.fhq_authority_configuration (
  singleton boolean primary key default true check (singleton),
  activation_at timestamptz not null default clock_timestamp()
);
insert into public.fhq_authority_configuration (singleton) values (true);

create table public.fhq_authority_clubs (
  pid uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 1000000),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  active_match uuid,
  origin text not null check (length(origin) between 1 and 40),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.fhq_authority_matches (
  id uuid primary key,
  owner uuid not null references public.fhq_authority_clubs(pid) on delete cascade,
  status text not null check (status in ('reserved', 'started', 'settled', 'cancelled')),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 1000000),
  seed bigint not null check (seed between 0 and 4294967295),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  result jsonb check (octet_length(result::text) <= 1000000),
  unique (id, owner)
);
create unique index fhq_authority_one_open_match on public.fhq_authority_matches(owner)
  where status in ('reserved', 'started');
create index fhq_authority_match_history on public.fhq_authority_matches(owner, issued_at desc);
alter table public.fhq_authority_clubs add constraint fhq_authority_owned_active_match
  foreign key (active_match, pid) references public.fhq_authority_matches(id, owner)
  deferrable initially deferred;

create table public.fhq_authority_operations (
  owner uuid not null references public.fhq_authority_clubs(pid) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null check (octet_length(response::text) <= 1000000),
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner, operation_id)
);

alter table public.fhq_authority_configuration enable row level security;
alter table public.fhq_authority_clubs enable row level security;
alter table public.fhq_authority_matches enable row level security;
alter table public.fhq_authority_operations enable row level security;
revoke all on table public.fhq_authority_configuration, public.fhq_authority_clubs,
  public.fhq_authority_matches, public.fhq_authority_operations from public, anon, authenticated, service_role;
grant select on table public.fhq_authority_configuration to service_role;
grant select, insert, update on table public.fhq_authority_clubs, public.fhq_authority_matches to service_role;
grant select, insert on table public.fhq_authority_operations to service_role;

-- One request is one database transaction. Club locks serialize operations by
-- owner. Sorting both owners prevents opposing raids from deadlocking. The
-- authenticated HTTP handler supplies owner and server-computed next states.
create function public.fhq_authority_commit(command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (command->>'owner')::uuid;
  op_id uuid := (command->>'operationId')::uuid;
  payload_hash text := command->>'requestHash';
  target_id uuid := (command->'target'->>'owner')::uuid;
  current_club public.fhq_authority_clubs%rowtype;
  target_club public.fhq_authority_clubs%rowtype;
  previous_op public.fhq_authority_operations%rowtype;
  previous_match public.fhq_authority_matches%rowtype;
  match_data jsonb := command->'match';
  match_id uuid := (command->'match'->>'id')::uuid;
  next_active uuid;
  next_status text := command->'match'->>'status';
  requested_status text := command->'match'->>'expectedStatus';
begin
  if owner_id is null or op_id is null or payload_hash is null
     or payload_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(command->'nextState') is distinct from 'object'
     or jsonb_typeof(command->'expectedRevision') is distinct from 'number'
     or not (command ? 'result')
     or (command ? 'target' and (target_id is null or target_id = owner_id
       or jsonb_typeof(command->'target'->'nextState') is distinct from 'object'
       or jsonb_typeof(command->'target'->'expectedRevision') is distinct from 'number')) then
    raise exception 'Invalid authority commit' using errcode = '22023';
  end if;

  perform pid from public.fhq_authority_clubs
    where pid = owner_id or pid = target_id order by pid for update;
  select * into current_club from public.fhq_authority_clubs where pid = owner_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  -- Retry answers use the latest club, while preserving the original receipt.
  -- Never return the historical save embedded in an earlier operation.
  select * into previous_op from public.fhq_authority_operations
    where owner = owner_id and operation_id = op_id;
  if found then
    if previous_op.request_hash is distinct from payload_hash then
      return jsonb_build_object('ok', false, 'code', 'operation_conflict', 'club', to_jsonb(current_club));
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'club', to_jsonb(current_club), 'result', previous_op.response);
  end if;
  if current_club.revision is distinct from (command->>'expectedRevision')::bigint then
    return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'club', to_jsonb(current_club));
  end if;
  if target_id is not null then
    select * into target_club from public.fhq_authority_clubs where pid = target_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'not_found', 'club', to_jsonb(current_club)); end if;
    if target_club.revision is distinct from (command->'target'->>'expectedRevision')::bigint then
      return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'club', to_jsonb(current_club));
    end if;
  end if;

  next_active := current_club.active_match;
  if command ? 'activeMatch' then
    next_active := (command->>'activeMatch')::uuid;
    -- Reservations can only be created or cleared with their corresponding
    -- match transition, so callers cannot strand an open match.
    if match_data is null and next_active is distinct from current_club.active_match then
      return jsonb_build_object('ok', false, 'code', 'match_conflict', 'club', to_jsonb(current_club));
    end if;
  end if;
  if match_data is not null then
    if match_id is null or (match_data->>'owner')::uuid is distinct from owner_id then
      return jsonb_build_object('ok', false, 'code', 'match_conflict', 'club', to_jsonb(current_club));
    end if;
    -- Do not lock another owner's match after taking only this owner's club
    -- lock; that would permit an inverted cross-owner lock order.
    if exists (select 1 from public.fhq_authority_matches where id = match_id and owner <> owner_id) then
      return jsonb_build_object('ok', false, 'code', 'match_conflict', 'club', to_jsonb(current_club));
    end if;
    select * into previous_match from public.fhq_authority_matches where id = match_id and owner = owner_id for update;
    if found then
      if previous_match.owner <> owner_id or previous_match.status is distinct from requested_status
         or previous_match.config is distinct from match_data->'config'
         or previous_match.metadata is distinct from coalesce(match_data->'metadata', '{}'::jsonb)
         or previous_match.seed is distinct from (match_data->>'seed')::bigint
         or previous_match.issued_at is distinct from to_timestamp((match_data->>'issuedAt')::double precision / 1000)
         or previous_match.expires_at is distinct from to_timestamp((match_data->>'expiresAt')::double precision / 1000)
         or current_club.active_match is distinct from match_id
         or not ((previous_match.status = 'reserved' and next_status in ('started', 'cancelled'))
              or (previous_match.status = 'started' and next_status in ('settled', 'cancelled'))) then
        return jsonb_build_object('ok', false, 'code', 'match_conflict', 'club', to_jsonb(current_club));
      end if;
    else
      if requested_status is not null or next_status not in ('reserved', 'started') or current_club.active_match is not null then
        return jsonb_build_object('ok', false, 'code', 'match_conflict', 'club', to_jsonb(current_club));
      end if;
    end if;
    next_active := case when next_status in ('reserved', 'started') then match_id else null end;
    if command ? 'activeMatch' and (command->>'activeMatch')::uuid is distinct from next_active then
      return jsonb_build_object('ok', false, 'code', 'match_conflict', 'club', to_jsonb(current_club));
    end if;

    if previous_match.id is null then
      insert into public.fhq_authority_matches (id, owner, status, config, seed, issued_at, expires_at, metadata, result)
      values (match_id, owner_id, next_status, match_data->'config', (match_data->>'seed')::bigint,
        to_timestamp((match_data->>'issuedAt')::double precision / 1000),
        to_timestamp((match_data->>'expiresAt')::double precision / 1000),
        coalesce(match_data->'metadata', '{}'::jsonb), match_data->'result');
    else
      update public.fhq_authority_matches set status = next_status,
        metadata = coalesce(match_data->'metadata', '{}'::jsonb), result = match_data->'result'
        where id = match_id and owner = owner_id;
    end if;
  end if;

  update public.fhq_authority_clubs set state = command->'nextState', revision = revision + 1,
    active_match = next_active, updated_at = clock_timestamp() where pid = owner_id returning * into current_club;
  if target_id is not null then
    update public.fhq_authority_clubs set state = command->'target'->'nextState',
      revision = revision + 1, updated_at = clock_timestamp() where pid = target_id;
  end if;
  insert into public.fhq_authority_operations (owner, operation_id, request_hash, response)
    values (owner_id, op_id, payload_hash, command->'result');
  return jsonb_build_object('ok', true, 'duplicate', false, 'club', to_jsonb(current_club), 'result', command->'result');
end;
$$;
revoke all on function public.fhq_authority_commit(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fhq_authority_commit(jsonb) to service_role;

-- Projection stays narrow even though this RPC is also service-only. A rival's
-- private roster, inventory, save, match config and receipts never leave it.
create function public.fhq_authority_rivals(requesting_owner uuid)
returns table (owner uuid, name text, stadium_level integer, fans bigint, trophies bigint, revision bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.pid, left(coalesce(c.state->>'teamName', 'Football Club'), 32),
    coalesce((select max((b->>'level')::integer) from jsonb_array_elements(c.state->'buildings') b
      where b->>'type' = 'STADIUM'), 1),
    greatest(0, coalesce((c.state->>'peakFans')::bigint, 0)),
    greatest(0, coalesce((c.state->>'trophies')::bigint, 0)), c.revision
  from public.fhq_authority_clubs c
  where c.pid <> requesting_owner and c.active_match is null
    and coalesce((c.state->>'currentMatch')::bigint, 1) >= 3
    and coalesce((c.state->>'shieldUntil')::bigint, 0) <= extract(epoch from now()) * 1000
  order by c.updated_at desc, c.pid
  limit 30;
$$;
revoke all on function public.fhq_authority_rivals(uuid) from public, anon, authenticated, service_role;
grant execute on function public.fhq_authority_rivals(uuid) to service_role;

-- A defender sees only a completed match aimed at that account. Strip internal
-- metadata and allowlist the engine-produced film fields, even for the attacker.
create function public.fhq_authority_match_film(requesting_owner uuid, match_id uuid)
returns table (id uuid, owner uuid, status text, config jsonb, seed bigint,
  issued_at timestamptz, expires_at timestamptz, metadata jsonb, result jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.owner, m.status, m.config, m.seed, m.issued_at, m.expires_at,
    '{}'::jsonb,
    case when m.result is null then null else jsonb_build_object(
      'replay', m.result->'replay', 'battleResult', m.result->'battleResult') end
  from public.fhq_authority_matches m
  where m.id = match_id and (m.owner = requesting_owner
    or (m.status = 'settled' and m.metadata->>'targetOwner' = requesting_owner::text));
$$;
revoke all on function public.fhq_authority_match_film(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.fhq_authority_match_film(uuid, uuid) to service_role;

create function public.fhq_authority_leaderboard()
returns table (owner uuid, name text, stadium_level integer, fans bigint, trophies bigint, revision bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.pid, left(coalesce(c.state->>'teamName', 'Football Club'), 32),
    coalesce((select max((b->>'level')::integer) from jsonb_array_elements(c.state->'buildings') b
      where b->>'type' = 'STADIUM'), 1),
    greatest(0, coalesce((c.state->>'peakFans')::bigint, 0)),
    greatest(0, coalesce((c.state->>'trophies')::bigint, 0)), c.revision
  from public.fhq_authority_clubs c
  order by greatest(0, coalesce((c.state->>'trophies')::bigint, 0)) desc, c.pid
  limit 50;
$$;
revoke all on function public.fhq_authority_leaderboard() from public, anon, authenticated, service_role;
grant execute on function public.fhq_authority_leaderboard() to service_role;
