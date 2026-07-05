-- Attack replays: the attacker's client records its deploy script + seed and attaches it
-- to the attack report, so the defender can WATCH the actual drive. Size-bounded jsonb.
alter table fhq_attacks add column if not exists replay jsonb;
alter table fhq_attacks add constraint fhq_attacks_replay_size check (replay is null or pg_column_size(replay) < 80000);
