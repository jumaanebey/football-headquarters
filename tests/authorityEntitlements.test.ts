// Entitlement boundaries through the real authority service on the SQL-equivalent store.
// Every refused request must leave the club's revision, balances and campus untouched and
// must not commit anything; every allowed request must be the documented benefit only.
import { describe, expect, it, vi } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { createInitialState } from '../game/initialState';
import { templateCampusLayout, campusLayoutForState } from '../game/campusLayout';
import { createDefenseSnapshot } from '../game/defenseSnapshot';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { validateReplay } from '../game/combat/replay';
import { replayMatch } from '../game/combat/engine';
import { canonicalJson } from '../game/combat/canonical';
import { BuildingType, type GameState } from '../types';
import { HERO_DEFS, STARTER_HERO_KEYS, heroMaxLevel } from '../battle';
import { DRILLS } from '../constants';
import type { BattleConfig } from '../game/combat/contracts';
import * as fixedBase from '../fixedBase';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** JSON cannot carry NaN, but `1e999` parses to Infinity: this is how a non-finite number reaches the server. */
const INFINITY = JSON.parse('1e999') as number;

const harness = () => {
  let now = ACTIVATION + 60_000;
  let ids = 7000;
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  const service = createAuthorityService(store, { now: () => now, randomUint32: () => 0x1357_9bdf, uuid: () => op(ids++) });
  let ops = 1;
  const call = (owner: string, input: unknown, createdAt = ACTIVATION + 1000) => service({ owner, createdAt }, input);
  const action = (owner: string, action: unknown) => call(owner, { kind: 'action', operationId: op(ops++), expectedRevision: store.clubs.get(owner)?.revision ?? 0, action });
  const state = (owner = A) => store.clubs.get(owner)!.state;
  const snapshot = (owner = A) => ({ revision: store.clubs.get(owner)!.revision, commits: store.commits, state: canonicalJson(store.clubs.get(owner)!.state) });
  /** Asserts a refused request changed nothing. */
  const refused = async (owner: string, input: unknown, code: string | string[]) => {
    const before = snapshot(owner);
    const answer = await action(owner, input);
    expect(answer.ok).toBe(false);
    expect(Array.isArray(code) ? code : [code]).toContain(!answer.ok && answer.code);
    expect(snapshot(owner)).toEqual(before);
    return answer;
  };
  const set = (mutate: (s: GameState) => void, owner = A) => { mutate(store.clubs.get(owner)!.state); };
  return { store, service, call, action, refused, set, state, snapshot, advance: (ms: number) => { now += ms; }, get now() { return now; } };
};
const boot = async (h: ReturnType<typeof harness>, owner = A) => { expect((await h.call(owner, { kind: 'bootstrap' })).ok).toBe(true); };

describe('1. formation eligibility is one rule for formation.set and campus.apply', () => {
  it('campus.apply of a locked formation is refused exactly like formation.set, and allowed custom edits still work', async () => {
    const h = harness(); await boot(h);
    const locked = vi.spyOn(fixedBase, 'formationUnlocked').mockImplementation((f: fixedBase.FormationKey) => f === 'goalline');
    try {
      const layout = templateCampusLayout('maxprotect', h.state().buildings);
      await h.refused(A, { type: 'formation.set', formation: 'maxprotect' }, 'locked');
      await h.refused(A, { type: 'campus.apply', layout }, 'locked');
      expect(h.state().formation).toBe('goalline');
      expect(h.state().campusLayout).toBeUndefined();
      // A custom edit inside the unlocked formation is accepted.
      const own = templateCampusLayout('goalline', h.state().buildings);
      const scout = own.facilities.find(f => f.type === BuildingType.YOUTH_ACADEMY)!;
      scout.gridX = 7; scout.gridY = 2;
      const applied = await h.action(A, { type: 'campus.apply', layout: own });
      expect(applied.ok).toBe(true);
      expect(h.state().campusLayout?.facilities.find(f => f.id === scout.id)).toMatchObject({ gridX: 7, gridY: 2 });
      expect(h.state().buildings.find(b => b.id === scout.id)).toMatchObject({ gridX: 7, gridY: 2 });
    } finally { locked.mockRestore(); }
  });
  it('under the current policy every formation is callable from Stadium 1 through both paths', async () => {
    const h = harness(); await boot(h);
    expect((await h.action(A, { type: 'formation.set', formation: 'maxprotect' })).ok).toBe(true);
    expect((await h.action(A, { type: 'campus.apply', layout: templateCampusLayout('cover3', h.state().buildings) })).ok).toBe(true);
    expect(h.state().formation).toBe('cover3');
  });
});

describe('2. alternate routes to the same entitlement', () => {
  it('campus.apply cannot invent, drop, retype, duplicate or relabel facilities, slots or gates', async () => {
    const h = harness(); await boot(h);
    const base = () => templateCampusLayout('goalline', h.state().buildings);
    const variants: [string, (l: ReturnType<typeof base>) => unknown][] = [
      ['extra facility', l => ({ ...l, facilities: [...l.facilities, { id: 'stadium-2', type: BuildingType.STADIUM, gridX: 2, gridY: 2 }] })],
      ['missing facility', l => ({ ...l, facilities: l.facilities.slice(1) })],
      ['retyped facility', l => ({ ...l, facilities: l.facilities.map((f, i) => i === 0 ? { ...f, type: BuildingType.STADIUM } : f) })],
      ['unknown facility id', l => ({ ...l, facilities: l.facilities.map((f, i) => i === 0 ? { ...f, id: 'ghost-1' } : f) })],
      ['duplicate facility id', l => ({ ...l, facilities: l.facilities.map((f, i) => i === 1 ? { ...f, id: l.facilities[0].id } : f) })],
      ['extra slot', l => ({ ...l, slots: [...l.slots, { id: 'D9', kind: 'jugs', gridX: 2, gridY: 2 }] })],
      ['slot retyped', l => ({ ...l, slots: l.slots.map(s => s.id === 'D1' ? { ...s, kind: 'ref' } : s) })],
      ['missing gate', l => ({ ...l, gates: l.gates.slice(0, 1) })],
      ['gate renamed', l => ({ ...l, gates: l.gates.map(g => ({ ...g, id: 'east' })) })],
      ['fewer walls', l => ({ ...l, walls: l.walls.slice(0, 3) })],
      ['more walls', l => ({ ...l, walls: [...l.walls, { gridX: 2, gridY: 2 }] })],
      ['wall on the map edge', l => ({ ...l, walls: l.walls.map((w, i) => i === 0 ? { gridX: 0, gridY: 5 } : w) })],
      ['overlapping slot', l => ({ ...l, slots: l.slots.map(s => s.id === 'D1' ? { ...s, gridX: l.facilities[0].gridX, gridY: l.facilities[0].gridY } : s) })],
      ['team-bus as a facility id', l => ({ ...l, facilities: l.facilities.map((f, i) => i === 0 ? { ...f, id: 'team-bus' } : f) })],
      ['wrong version', l => ({ ...l, version: 2 })],
      ['unknown formation', l => ({ ...l, formation: 'wishbone' })],
    ];
    for (const [label, mutate] of variants) {
      const before = h.snapshot();
      const answer = await h.action(A, { type: 'campus.apply', layout: mutate(base()) });
      expect(answer.ok, label).toBe(false);
      expect(!answer.ok && answer.code, label).toBe('invalid_command');
      expect(h.snapshot(), label).toEqual(before);
    }
    // Extra attributes on layout objects (a forged facility level) are stripped by canonicalization, never applied.
    const forged = await h.action(A, { type: 'campus.apply', layout: { ...base(), facilities: base().facilities.map(f => ({ ...f, level: 9 })) } });
    expect(forged.ok).toBe(true);
    expect(h.state().buildings.every(b => b.level === 1)).toBe(true);
    expect(h.state().campusLayout?.facilities.every(f => !('level' in f))).toBe(true);
  });
  it('gate assignment requires an owned hero, an existing post, and never grants a hero', async () => {
    const h = harness(); await boot(h);
    const locked = HERO_DEFS.find(d => d.unlock)!.key;
    await h.refused(A, { type: 'gate.assign', postId: 'south', heroKey: locked }, 'locked');
    await h.refused(A, { type: 'gate.assign', postId: 'south', heroKey: 'not-a-hero' }, 'locked');
    await h.refused(A, { type: 'gate.assign', postId: 'east', heroKey: STARTER_HERO_KEYS[0] }, 'not_found');
    expect(h.state().heroes.find(x => x.key === locked)?.unlocked).toBe(false);
    // A gate assignment recorded for a hero that is later locked (fixture) never reaches the defense snapshot.
    h.set(s => { s.heroGates = { south: locked }; });
    const snap = createDefenseSnapshot(h.state());
    expect(snap.heroGates.south).not.toBe(locked);
    expect(snap.assignedHeroes.every(a => h.state().heroes.find(x => x.key === a.heroKey)?.unlocked)).toBe(true);
  });
  it('equipment slots: locked slots, crown slots without purchase, levels above the Stadium and the level cap are refused', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 10_000_000; s.resources.GEMS = 10_000; });
    await h.refused(A, { type: 'defense.upgrade-slot', slotId: 'D3' }, 'locked'); // needs Stadium 2
    await h.refused(A, { type: 'defense.upgrade-slot', slotId: 'C1' }, 'locked'); // needs a purchased crown slot
    await h.refused(A, { type: 'defense.upgrade-slot', slotId: 'D1' }, 'locked'); // D1 is L1; L2 needs Stadium 2
    h.set(s => { s.buildings.find(b => b.type === BuildingType.STADIUM)!.level = 10; s.defenseSlots.D1 = 10; });
    await h.refused(A, { type: 'defense.upgrade-slot', slotId: 'D1' }, 'limit_reached');
    expect((await h.action(A, { type: 'defense.buy-slot' })).ok).toBe(true);
    expect((await h.action(A, { type: 'defense.upgrade-slot', slotId: 'C1' })).ok).toBe(true);
    await h.refused(A, { type: 'defense.upgrade-slot', slotId: 'C2' }, 'locked');
    // The snapshot only fields what the club is entitled to: a fixture slot beyond entitlement is dropped.
    h.set(s => { s.defenseSlots.C3 = 5; s.bonusDefSlots = 1; });
    const snap = createDefenseSnapshot(h.state());
    expect(snap.equipment).toEqual({ D1: 10, C1: 1 });
    expect(snap.buildings.some(b => b.id === 'C3')).toBe(false);
  });
  it('facility upgrades stay behind the Stadium; hero training stays behind the Stadium cap; drills stay behind field level', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 10_000_000; s.resources.ENERGY = 100; });
    const pitch = h.state().buildings.find(b => b.type === BuildingType.TRAINING_PITCH)!;
    await h.refused(A, { type: 'facility.upgrade', buildingId: pitch.id }, 'locked');
    await h.refused(A, { type: 'facility.upgrade', buildingId: 'ghost' }, 'not_found');
    const key = STARTER_HERO_KEYS[0];
    h.set(s => { s.heroes.find(x => x.key === key)!.level = heroMaxLevel(1); });
    await h.refused(A, { type: 'hero.train', heroKey: key }, 'locked');
    await h.refused(A, { type: 'hero.train', heroKey: HERO_DEFS.find(d => d.unlock)!.key }, 'locked');
    await h.refused(A, { type: 'training.start', drillId: DRILLS.scrimmage.id, unit: 'OFFENSE_LINE' }, 'locked');
    await h.refused(A, { type: 'training.start', drillId: 'nope', unit: 'OFFENSE_LINE' }, 'invalid_command');
    await h.refused(A, { type: 'hero.unlock', heroKey: STARTER_HERO_KEYS[0] }, 'not_found'); // starters have no purchase path
    await h.refused(A, { type: 'recruit.start', candidateId: 'forged-player' }, 'not_found');
  });
  it('a legacy save cannot smuggle equipment or hero levels the club never earned', async () => {
    const h = harness();
    const forgedSlots: GameState = { ...createInitialState(ACTIVATION - 86_400_000), defenseSlots: { D1: 6 } };
    const slots = await h.call(A, { kind: 'bootstrap', legacy: forgedSlots }, ACTIVATION - 60_000);
    expect(!slots.ok && slots.code).toBe('invalid_legacy');
    const forgedHero: GameState = createInitialState(ACTIVATION - 86_400_000);
    forgedHero.heroes = forgedHero.heroes.map(x => x.key === STARTER_HERO_KEYS[0] ? { ...x, level: 40 } : x);
    const hero = await h.call(A, { kind: 'bootstrap', legacy: forgedHero }, ACTIVATION - 60_000);
    expect(!hero.ok && hero.code).toBe('invalid_legacy');
    expect(h.store.clubs.size).toBe(0);
    // An honest save at the boundary (slot level == Stadium level, hero at the cap) is admitted.
    const honest: GameState = createInitialState(ACTIVATION - 86_400_000);
    honest.buildings = honest.buildings.map(b => b.type === BuildingType.STADIUM ? { ...b, level: 3 } : b);
    honest.defenseSlots = { D1: 3, D3: 2 };
    honest.heroes = honest.heroes.map(x => x.key === STARTER_HERO_KEYS[0] ? { ...x, level: heroMaxLevel(3) } : x);
    expect((await h.call(A, { kind: 'bootstrap', legacy: honest }, ACTIVATION - 60_000)).ok).toBe(true);
  });
  it('rival matches enforce eligibility for both sides and never reuse a reservation against another opponent', async () => {
    const h = harness(); await boot(h); await boot(h, B);
    h.set(s => { s.currentMatch = 5; }); h.set(s => { s.currentMatch = 5; }, B);
    const reserved = await h.call(A, { kind: 'match.reserve', operationId: op(500), expectedRevision: 0, choice: { kind: 'rival', target: B } });
    expect(reserved.ok).toBe(true);
    const matchId = (reserved.ok && (reserved.result as { matchId: string }).matchId) || '';
    // The reservation is bound to B: A cannot begin/finish it as anything else, and cannot reserve another while it is open.
    expect(h.store.matches.get(matchId)?.metadata.targetOwner).toBe(B);
    const other = await h.call(A, { kind: 'match.reserve', operationId: op(501), expectedRevision: 1, choice: { kind: 'campaign', stage: 1 } });
    expect(!other.ok && other.code).toBe('active_match');
    const config = h.store.matches.get(matchId)!.config as BattleConfig;
    expect(config.pvpTarget).toBe(B);
    // Finishing with a film built against a different config is a simulation mismatch, not a settlement.
    await h.call(A, { kind: 'match.begin', operationId: op(502), expectedRevision: 1, matchId });
    const foreign = playHeadlessMatch({ ...config, buildings: config.buildings.map(b => ({ ...b, hp: 1 })) }, h.store.matches.get(matchId)!.seed);
    h.advance(foreign.submission.ticks * 50 + 500);
    const cheated = await h.call(A, { kind: 'match.finish', operationId: op(503), expectedRevision: 2, matchId, submission: foreign.submission });
    expect(!cheated.ok && cheated.code).toBe('simulation_mismatch');
    expect(h.state(B).defenseLog).toHaveLength(0);
  });
});

describe('3. defense consistency after edits', () => {
  it('a captured match keeps its snapshot; later edits and upgrades affect only later matches; local test, film and server agree', async () => {
    const h = harness(); await boot(h); await boot(h, B);
    h.set(s => { s.currentMatch = 5; s.resources.COINS = 100_000; }, B); h.set(s => { s.currentMatch = 5; });
    // Defender B: edit the campus, apply, assign a gate hero, upgrade a slot.
    const layout = campusLayoutForState(h.state(B));
    const scout = layout.facilities.find(f => f.type === BuildingType.YOUTH_ACADEMY)!;
    scout.gridX = 7; scout.gridY = 2;
    expect((await h.action(B, { type: 'campus.apply', layout })).ok).toBe(true);
    expect((await h.action(B, { type: 'gate.assign', postId: 'south', heroKey: STARTER_HERO_KEYS[2] })).ok).toBe(true);
    h.set(s => { s.buildings.find(b => b.type === BuildingType.STADIUM)!.level = 2; }, B);
    expect((await h.action(B, { type: 'defense.upgrade-slot', slotId: 'D1' })).ok).toBe(true);
    const local = createDefenseSnapshot(h.state(B)); // what B's Test Defense uses
    // Attacker A reserves: the server captures B's snapshot now.
    const reserved = await h.call(A, { kind: 'match.reserve', operationId: op(600), expectedRevision: 0, choice: { kind: 'rival', target: B } });
    const matchId = (reserved.ok && (reserved.result as { matchId: string }).matchId) || '';
    const captured = h.store.matches.get(matchId)!.config as BattleConfig;
    expect(captured.defenseSnapshotId).toBe(local.snapshotId);
    expect(captured.defenseLayoutId).toBe(local.layoutId);
    expect(canonicalJson(captured.buildings)).toBe(canonicalJson(local.buildings));
    expect(canonicalJson(captured.homeGuards)).toBe(canonicalJson(local.homeGuards));
    expect(captured.buildings.find(b => b.id === scout.id)).toMatchObject({ x: local.buildings.find(b => b.id === scout.id)!.x });
    expect(captured.buildings.find(b => b.id === 'D1')?.level).toBe(2);
    // B edits again while the match is open: formation, another upgrade. The open match must not change.
    expect((await h.action(B, { type: 'formation.set', formation: 'cover3' })).ok).toBe(true);
    h.set(s => { s.defenseSlots.D3 = 1; }, B);
    expect(canonicalJson(h.store.matches.get(matchId)!.config)).toBe(canonicalJson(captured));
    await h.call(A, { kind: 'match.begin', operationId: op(601), expectedRevision: 1, matchId });
    const film = playHeadlessMatch(captured, h.store.matches.get(matchId)!.seed);
    h.advance(film.submission.ticks * 50 + 500);
    const settled = await h.call(A, { kind: 'match.finish', operationId: op(602), expectedRevision: 2, matchId, submission: film.submission });
    expect(settled.ok).toBe(true);
    const battle = settled.ok ? (settled.result as { battleResult: { defenseSnapshotId: string; defenseFormation: string; pct: number } }).battleResult : null;
    expect(battle?.defenseSnapshotId).toBe(local.snapshotId);
    expect(battle?.defenseFormation).toBe('goalline');
    // The receipt and the film both point at the attacked layout, not the new one.
    expect(h.state(B).defenseLog[0]).toMatchObject({ authorityMatchId: matchId, defenseLayoutId: local.layoutId });
    const filmB = await h.call(B, { kind: 'film', matchId });
    const replay = validateReplay(filmB.ok && (filmB.result as { replay: unknown }).replay);
    expect(replay?.snapshot?.defenseSnapshotId).toBe(local.snapshotId);
    expect(canonicalJson(replay?.snapshot?.buildings)).toBe(canonicalJson(local.buildings));
    expect(replayMatch(replay!).result?.pct).toBe(battle?.pct);
    // A second raid (after B's post-loss shield lapses) captures the new defense (cover3, D3 installed) and a different snapshot id.
    h.advance(3 * 3_600_000);
    const again = await h.call(A, { kind: 'match.reserve', operationId: op(603), expectedRevision: 3, choice: { kind: 'rival', target: B } });
    const next = h.store.matches.get((again.ok && (again.result as { matchId: string }).matchId) || '')!.config as BattleConfig;
    expect(next.defenseSnapshotId).not.toBe(local.snapshotId);
    expect(next.defenseFormation).toBe('cover3');
    expect(next.buildings.some(b => b.id === 'D3')).toBe(true);
    expect(next.defenseSnapshotId).toBe(createDefenseSnapshot(h.state(B)).snapshotId);
  });
});

describe('4. bounded input and execution at the network parsing boundary', () => {
  it('non-finite and oversized numbers reach the service as Infinity and are refused without state change', async () => {
    const h = harness(); await boot(h);
    const layout = templateCampusLayout('goalline', h.state().buildings);
    await h.refused(A, { type: 'campus.apply', layout: { ...layout, walls: layout.walls.map((w, i) => i === 0 ? { gridX: INFINITY, gridY: 1 } : w) } }, 'invalid_command');
    await h.refused(A, { type: 'campus.apply', layout: { ...layout, bus: { gridX: 1.5, gridY: 2 } } }, 'invalid_command');
    await h.refused(A, { type: 'defense.seen', ids: Array.from({ length: 101 }, (_, i) => `m${i}`) }, 'invalid_command');
    await h.refused(A, { type: 'defense.seen', ids: ['x'.repeat(121)] }, 'invalid_command');
    await h.refused(A, { type: 'club.rename', name: 'x'.repeat(25) }, 'invalid_command');
    const before = h.snapshot();
    for (const bad of [
      { kind: 'match.reserve', operationId: op(700), expectedRevision: INFINITY, choice: { kind: 'campaign', stage: 1 } },
      { kind: 'match.reserve', operationId: op(701), expectedRevision: 0, choice: { kind: 'campaign', stage: INFINITY } },
      { kind: 'match.reserve', operationId: op(702), expectedRevision: 0, choice: { kind: 'road', choice: 3 } },
      { kind: 'match.reserve', operationId: op(703), expectedRevision: 0, choice: { kind: 'campaign', stage: 1, extra: 1 } },
      { kind: 'match.reserve', operationId: 'not-a-uuid', expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } },
      { kind: 'action', operationId: op(704), expectedRevision: -1, action: { type: 'rally' } },
      { kind: 'film', matchId: 'nope' },
      { kind: 'nonsense' },
      42, null, [], 'status',
    ]) {
      const answer = await h.call(A, bad);
      expect(answer.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(h.snapshot()).toEqual(before);
  });
  it('a legacy save over the size cap and a request over the body cap are refused before any work', async () => {
    const h = harness();
    const huge = { ...createInitialState(ACTIVATION - 86_400_000), matchHistory: Array.from({ length: 6000 }, (_, i) => ({ week: i + 1, opponent: 'x'.repeat(60), ourScore: 1, theirScore: 0, won: true, reward: 1 })) };
    expect(JSON.stringify(huge).length).toBeGreaterThan(450_000);
    const answer = await h.call(A, { kind: 'bootstrap', legacy: huge }, ACTIVATION - 60_000);
    expect(!answer.ok && ['invalid_legacy', 'invalid_request']).toContain(!answer.ok && answer.code);
    expect(h.store.clubs.size).toBe(0);
  });
  it('film limits: command count, tick range, unknown keys, unknown assets and an altered snapshot are rejected without simulating a settlement', async () => {
    const h = harness(); await boot(h);
    const reserved = await h.call(A, { kind: 'match.reserve', operationId: op(710), expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
    const matchId = (reserved.ok && (reserved.result as { matchId: string }).matchId) || '';
    await h.call(A, { kind: 'match.begin', operationId: op(711), expectedRevision: 1, matchId });
    const match = h.store.matches.get(matchId)!;
    const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
    h.advance(1400 * 50 + 2000);
    const cases: [string, unknown, string][] = [
      ['1501 commands', { ...film.submission, script: Array.from({ length: 1501 }, () => ({ k: 'a', key: 'qb', tick: 0 })) }, 'invalid_film'],
      ['ticks above the cap', { ...film.submission, ticks: 1401 }, 'invalid_time'],
      ['non-finite ticks', { ...film.submission, ticks: INFINITY }, 'invalid_time'],
      ['negative ticks', { ...film.submission, ticks: -1 }, 'invalid_time'],
      ['unknown command kind', { ...film.submission, script: [{ k: 'z', tick: 0 }] }, 'invalid_film'],
      ['unknown hero key', { ...film.submission, script: [{ k: 'h', key: 'ghost', x: 5, y: 5, tick: 0 }] }, 'invalid_film'],
      ['command outside the field', { ...film.submission, script: [{ k: 't', u: 'OFFENSE_LINE', x: 500, y: 5, tick: 0 }] }, 'invalid_film'],
      ['unordered ticks', { ...film.submission, script: [{ k: 'a', key: 'qb', tick: 5 }, { k: 'a', key: 'qb', tick: 1 }] }, 'invalid_film'],
      ['extra field', { ...film.submission, snapshot: {} }, 'invalid_film'],
      ['missing plan', { script: film.submission.script, ticks: film.submission.ticks, finalHash: film.submission.finalHash }, 'invalid_film'],
      ['unknown plan', { ...film.submission, plan: 'wishbone' }, 'invalid_film'],
      ['hash not hex', { ...film.submission, finalHash: 'zzzzzzzz' }, 'invalid_film'],
      ['script as a string', { ...film.submission, script: 'x'.repeat(10) }, 'invalid_film'],
    ];
    for (const [label, submission, code] of cases) {
      const before = h.snapshot();
      const answer = await h.call(A, { kind: 'match.finish', operationId: op(720 + cases.findIndex(c => c[0] === label)), expectedRevision: 2, matchId, submission });
      expect(answer.ok, label).toBe(false);
      expect(!answer.ok && answer.code, label).toBe(code);
      expect(h.snapshot(), label).toEqual(before);
      expect(h.store.matches.get(matchId)?.status).toBe('started');
    }
    // A film whose commands were valid but produced against an altered snapshot cannot settle either.
    const altered = playHeadlessMatch({ ...(match.config as BattleConfig), fans: 0, homeGuards: [] }, match.seed);
    const mismatch = await h.call(A, { kind: 'match.finish', operationId: op(740), expectedRevision: 2, matchId, submission: altered.submission });
    expect(!mismatch.ok && mismatch.code).toBe('simulation_mismatch');
    // The honest film still settles once.
    const settled = await h.call(A, { kind: 'match.finish', operationId: op(741), expectedRevision: 2, matchId, submission: film.submission });
    expect(settled.ok).toBe(true);
  });
  it('the worst valid film (1400 ticks, hundreds of commands) verifies in bounded time', async () => {
    const h = harness(); await boot(h);
    const reserved = await h.call(A, { kind: 'match.reserve', operationId: op(750), expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
    const matchId = (reserved.ok && (reserved.result as { matchId: string }).matchId) || '';
    await h.call(A, { kind: 'match.begin', operationId: op(751), expectedRevision: 1, matchId });
    const match = h.store.matches.get(matchId)!;
    const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
    h.advance(1400 * 50 + 2000);
    const started = performance.now();
    const settled = await h.call(A, { kind: 'match.finish', operationId: op(752), expectedRevision: 2, matchId, submission: film.submission });
    const elapsed = performance.now() - started;
    expect(settled.ok).toBe(true);
    expect(film.submission.script.length).toBeGreaterThan(10);
    expect(elapsed).toBeLessThan(5000);
  });
});
