import { describe, expect, it } from 'vitest';
import { HERO_DEFS, type ReplayAction, type ReplayData } from '../battle';
import { UnitGroup } from '../types';
import { heroPracticeConfig } from '../game/combat/practice';
import { createBattleEngine, replayMatch, type BattleEngine } from '../game/combat/engine';
import type { BattleConfig, BattleResult } from '../game/combat/contracts';
import { validateReplay } from '../game/combat/replay';

const SEED = 93841;
const tick = (engine: BattleEngine, count: number) => {
  for (let i = 0; i < count && !engine.state.ended; i++) engine.advance();
};
const deploy = (engine: BattleEngine, key = 'qb', x = 8, y = 80) =>
  engine.command({ k: 'h', key, x, y, tick: engine.state.ticks });
const signature = (engine: BattleEngine, key: string) => engine.command({ k: 'a', key, tick: engine.state.ticks });
const outcome = (result: BattleResult | null) => {
  if (!result) return null;
  const { isReplay: _, ...gameplay } = result;
  return gameplay;
};
const expectReplay = (live: BattleEngine) => {
  expect(live.state.ended).toBe(true);
  const recording = JSON.parse(JSON.stringify(live.getReplay())) as ReplayData;
  expect(validateReplay(recording)).not.toBeNull();
  const replay = replayMatch(recording);
  expect(replay.matches).toBe(true);
  expect(replay.engine.rejectedCommands).toBe(0);
  expect(replay.engine.state.ticks).toBe(live.state.ticks);
  expect(replay.hash).toBe(live.hash);
  expect(outcome(replay.result)).toEqual(outcome(live.result));
  expect(replay.engine.state.buildings).toEqual(live.state.buildings);
  expect(replay.engine.state.troops).toEqual(live.state.troops);
  expect(replay.engine.state.guards).toEqual(live.state.guards);
  return replay;
};
const compactDefense = (): BattleConfig => ({
  mode: 'defense', title: 'Defense regression', loot: { coins: 0, fans: 0 },
  buildings: [{ id: 'home', kind: 'hq', x: 50, y: 45, size: 12, hp: 100000 }],
  preTroops: [{ unit: UnitGroup.OFFENSE_LINE, x: 8, y: 80 }],
  homeGuards: [{ name: 'Home blocker', jersey: 55, hp: 20000, dps: 300, x: 30, y: 64 }],
  fans: 1500, masteryTier: 3,
});

describe('shared live, recorded and replayed combat', () => {
  it('records and replays the exact early whistle, including commands on its final tick', () => {
    const live = createBattleEngine(heroPracticeConfig('qb'), SEED);
    expect(deploy(live)).toBe(true);
    tick(live, 13);
    expect(signature(live, 'qb')).toBe(true);
    tick(live, 47);
    expect(live.finish()).toBe(true);
    expect(live.getReplay().script.at(-1)).toEqual({ k: 'e', tick: 60 });
    expectReplay(live);
  });

  it('replays natural completion without adding an artificial whistle', () => {
    const config = heroPracticeConfig('qb');
    config.buildings = [{ id: 'target', kind: 'building', x: 40, y: 55, size: 8, hp: 100 }];
    const live = createBattleEngine(config, SEED);
    expect(deploy(live, 'qb', 10, 80)).toBe(true);
    expect(signature(live, 'qb')).toBe(true);
    tick(live, 1400);
    expect(live.result?.pct).toBe(100);
    expect(live.getReplay().script.some(action => action.k === 'e')).toBe(false);
    expectReplay(live);
  });

  it('replays the clock expiring with reserves still available', () => {
    const config = heroPracticeConfig('qb');
    config.buildings = [{ id: 'target', kind: 'building', x: 50, y: 40, size: 8, hp: 1000000 }];
    const live = createBattleEngine(config, SEED);
    expect(deploy(live)).toBe(true);
    tick(live, 1400);
    expect(live.state.time).toBeLessThanOrEqual(0);
    expect(live.state.troops.some(actor => !actor.dead)).toBe(true);
    expectReplay(live);
  });

  it('replays defense play charges, spawned guards, and a natural defensive hold', () => {
    const live = createBattleEngine(compactDefense(), SEED);
    expect(live.command({ k: 'd', key: 'pkg', tick: 0 })).toBe(true);
    tick(live, 10);
    expect(live.command({ k: 'd', key: 'noise', tick: live.state.ticks })).toBe(true);
    tick(live, 1400);
    expect(live.result?.won).toBe(true);
    expectReplay(live);
  });

  it('waits through quiet gaps between Gauntlet waves and replays the cleared night', () => {
    const config = compactDefense();
    config.preTroops = [];
    config.gauntlet = { tier: 2, waves: [
      { at: 0, label: 'First drive', mult: 0.25, troops: [{ unit: UnitGroup.OFFENSE_LINE, x: 30, y: 64 }] },
      { at: 3, label: 'Second drive', mult: 0.25, troops: [{ unit: UnitGroup.OFFENSE_LINE, x: 30, y: 64 }] },
    ] };
    const live = createBattleEngine(config, SEED);
    tick(live, 20);
    expect(live.state.nextWave).toBe(1);
    expect(live.state.troops.every(actor => actor.dead)).toBe(true);
    expect(live.state.ended).toBe(false);
    tick(live, 1400);
    expect(live.result).toMatchObject({ gauntletTier: 2, wavesHeld: 2, gauntletCleared: true });
    expectReplay(live);
  });

  it('does not claim the unfinished Gauntlet wave when the coach blows an early whistle', () => {
    const config = compactDefense();
    config.homeGuards = [];
    config.preTroops = [];
    config.gauntlet = { tier: 1, waves: [{ at: 0, label: 'Opening drive', mult: 1, troops: [{ unit: UnitGroup.OFFENSE_LINE, x: 8, y: 80 }] }] };
    const live = createBattleEngine(config, SEED);
    tick(live, 10); live.finish();
    expect(live.result).toMatchObject({ wavesHeld: 0, gauntletCleared: false });
    expectReplay(live);
  });

  it('keeps engines and source inputs independent, including IDs under interleaved advancement', () => {
    const config = heroPracticeConfig('qb'), pristine = structuredClone(config);
    const first = createBattleEngine(config, SEED), second = createBattleEngine(config, SEED);
    config.heroes![0].hp = 1; config.buildings[0].hp = 1; config.squad![0].stats.strength = 9999;
    expect(deploy(first)).toBe(true); tick(first, 12);
    expect(deploy(second)).toBe(true); tick(second, 12);
    expect(first.state.troops).toEqual(second.state.troops);
    expect(first.state.troops[0].hp).toBe(pristine.heroes![0].hp);
    expect(first.state.buildings[0].maxHp).toBe(pristine.buildings[0].hp);
    expect(first.hash).toBe(second.hash);
  });

  it('does not let an exported replay snapshot modify a running match', () => {
    const config = heroPracticeConfig('qb'), first = createBattleEngine(config, SEED);
    const exported = first.getReplay();
    exported.snapshot!.heroes![0].hp = 1;
    exported.snapshot!.playerArmy![UnitGroup.OFFENSE_LINE] = 100;
    exported.snapshot!.squad![0].stats.strength = 9999;
    expect(deploy(first)).toBe(true);
    const independent = createBattleEngine(config, SEED); expect(deploy(independent)).toBe(true);
    expect(first.state.troops).toEqual(independent.state.troops);
    expect(first.getReplay().snapshot).toEqual(independent.getReplay().snapshot);
  });

  it('rejects changed outcome inputs even when the sequence of field movement is unchanged', () => {
    const config = heroPracticeConfig('qb'); config.practice = false; config.loot = { coins: 500, fans: 20 };
    const live = createBattleEngine(config, SEED);
    expect(deploy(live)).toBe(true); signature(live, 'qb'); tick(live, 60); live.finish();
    const recording = live.getReplay();
    recording.snapshot!.loot.coins = 999999;
    expect(replayMatch(recording).matches).toBe(false);
  });

  it.each(['extra command', 'wrong final tick'] as const)('rejects a recording with %s', mutation => {
    const live = createBattleEngine(heroPracticeConfig('qb'), SEED);
    deploy(live); tick(live, 10); live.finish();
    const recording = live.getReplay();
    if (mutation === 'extra command') recording.script.push({ k: 'h', key: 'enforcer', x: 8, y: 80, tick: 5000 });
    else recording.ticks = 999;
    expect(replayMatch(recording).matches).toBe(false);
  });
});

describe('command boundaries', () => {
  it('rejects invalid or duplicate deployments without spending reserves or recording commands', () => {
    const engine = createBattleEngine(heroPracticeConfig('qb'), SEED);
    const invalid: ReplayAction[] = [
      { k: 'h', key: 'unknown', tick: 0, x: 8, y: 80 },
      { k: 'h', key: 'qb', tick: 0, x: NaN, y: 80 },
      { k: 'h', key: 'qb', tick: 0, x: 99, y: 80 },
      { k: 'h', key: 'qb', tick: 0, x: 56, y: 42 },
      { k: 'h', key: 'qb', tick: 1, x: 8, y: 80 },
      { k: 't', u: UnitGroup.DEFENSE_SECONDARY, tick: 0, x: 8, y: 80 },
      { k: 'a', key: 'qb', tick: 0 },
    ];
    const before = structuredClone(engine.army);
    for (const action of invalid) expect(engine.command(action)).toBe(false);
    expect(engine.army).toEqual(before); expect(engine.state.troops).toHaveLength(0);
    expect(engine.getReplay().script).toHaveLength(0);
    expect(deploy(engine)).toBe(true);
    expect(deploy(engine)).toBe(false);
    expect(signature(engine, 'qb')).toBe(true); expect(signature(engine, 'qb')).toBe(false);
    expect(engine.state.troops).toHaveLength(1); expect(engine.getReplay().script).toHaveLength(2);
    engine.finish(); expect(deploy(engine, 'enforcer')).toBe(false);
  });

  it('leaves defense-play inventory intact when a missing Stadium rejects the package', () => {
    const config = compactDefense(); config.buildings[0].kind = 'building';
    const engine = createBattleEngine(config, SEED), available = engine.defensePlays.pkg;
    expect(engine.command({ k: 'd', key: 'pkg', tick: 0 })).toBe(false);
    expect(engine.defensePlays.pkg).toBe(available);
    expect(engine.getReplay().script).toHaveLength(0);
  });
});

describe('all-nine-hero signatures under full simulation', () => {
  it.each(HERO_DEFS.map(hero => hero.key))('runs and exactly replays %s with a timed signature', key => {
    const live = createBattleEngine(heroPracticeConfig(key), SEED);
    expect(deploy(live, key)).toBe(true);
    expect(signature(live, key)).toBe(true);
    expect(live.state.troops[0].activeAction).toBeTruthy();
    tick(live, 25);
    const actor = live.state.troops[0];
    if (['coach', 'enforcer', 'burner', 'legend'].includes(key)) expect(actor.rageT).toBeGreaterThan(0);
    if (key === 'captain') expect(actor.shieldT).toBeGreaterThan(0);
    if (key === 'medic') expect(actor.healT).toBeGreaterThan(0);
    if (key === 'burner') expect(actor.sprintT).toBeGreaterThan(0);
    if (key === 'playmaker') expect(live.state.troops).toHaveLength(4);
    if (['qb', 'kicker'].includes(key)) expect(live.state.buildings.some(building => building.hp < building.maxHp)).toBe(true);
    tick(live, 75);
    expect(live.state.troops[0].activeAction).toBeUndefined();
    expect(live.state.troops[0].abilityCd).toBeGreaterThan(0);
    expect(live.actions.current).toHaveLength(0);
    live.finish(); expectReplay(live);
  });

  it('plants, accelerates continuously and spends Truck Stick on a blocking wall at contact', () => {
    const config = heroPracticeConfig('enforcer');
    config.buildings = [
      { id: 'protected-target', kind: 'building', x: 55, y: 50, size: 8, hp: 10000 },
      ...Array.from({ length: 13 }, (_, i) => ({ id: `wall-${i}`, kind: 'wall' as const, x: 30, y: i * 8, size: 8, hp: 1000 })),
    ];
    const engine = createBattleEngine(config, SEED);
    expect(deploy(engine, 'enforcer', 8, 50)).toBe(true);
    expect(signature(engine, 'enforcer')).toBe(true);
    const actor = engine.state.troops[0];
    tick(engine, 6);
    expect({ x: actor.x, y: actor.y }).toEqual({ x: 8, y: 50 });
    let peakStep = 0, burstContacts = 0;
    for (let i = 0; i < 55; i++) {
      const before = { x: actor.x, y: actor.y, yardage: actor.dmg ?? 0 };
      engine.advance();
      const displacement = Math.hypot(actor.x - before.x, actor.y - before.y);
      peakStep = Math.max(peakStep, displacement);
      expect(displacement).toBeLessThanOrEqual(1.2000001);
      expect(actor.x).toBeLessThan(30); // never pass through the standing barrier
      if ((actor.dmg ?? 0) - before.yardage > 50) burstContacts++;
    }
    expect(peakStep).toBeGreaterThan(1);
    expect(burstContacts).toBe(1);
    expect(actor.truckT ?? 0).toBe(0);
    expect(engine.state.buildings[0].hp).toBe(10000);
    const wall = engine.state.buildings.find(building => building.kind === 'wall' && building.hp < building.maxHp)!;
    expect(wall).toBeDefined();
    expect(Math.hypot(actor.x - wall.x, actor.y - wall.y)).toBeGreaterThanOrEqual(actor.range + wall.size / 2 - 1e-7);
    engine.finish(); expectReplay(engine);
  });
});

describe('untrusted v2 film validation', () => {
  const film = () => {
    const engine = createBattleEngine(heroPracticeConfig('qb'), SEED);
    deploy(engine); tick(engine, 10); engine.finish();
    return engine.getReplay();
  };

  it('returns an independently owned validated recording', () => {
    const recording = film(), validated = validateReplay(recording)!;
    expect(validated).not.toBeNull();
    validated.snapshot!.heroes![0].hp = 1;
    expect(recording.snapshot!.heroes![0].hp).toBeGreaterThan(1);
  });

  it.each([
    ['mismatched layout', (replay: ReplayData) => { replay.layout[0].hp += 1; }],
    ['unknown rules', (replay: ReplayData) => { replay.rules = 'unsupported-rules'; }],
    ['fractional command tick', (replay: ReplayData) => { replay.script[0].tick = 0.5; }],
    ['duplicate layout ID', (replay: ReplayData) => { replay.layout[1].id = replay.layout[0].id; replay.snapshot!.buildings[1].id = replay.layout[0].id; }],
    ['unknown hero', (replay: ReplayData) => { replay.script[0].key = 'not-a-hero'; }],
    ['command beyond the recorded end', (replay: ReplayData) => { replay.script.push({ k: 'e', tick: replay.ticks! + 1 }); }],
    ['external facility art', (replay: ReplayData) => { replay.layout[0].art = 'https://example.com/untrusted.png'; replay.snapshot!.buildings[0].art = replay.layout[0].art; }],
    ['excessive command count', (replay: ReplayData) => { replay.script = Array.from({ length: 1501 }, () => ({ ...replay.script[0] })); }],
  ] as const)('rejects %s before simulation', (_, mutate) => {
    const recording = film(); mutate(recording);
    expect(validateReplay(recording)).toBeNull();
  });
});


describe('database replay transport', () => {
  it('preserves verified results when JSON object keys are reordered', () => {
    const live=createBattleEngine(heroPracticeConfig('qb'),SEED,'ground');
    expect(deploy(live)).toBe(true);
    signature(live,'qb');tick(live,50);live.finish();
    const reorder=(value:unknown):unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])) : value;
    const transported=reorder(live.getReplay()) as ReplayData;
    expect(validateReplay(transported)).not.toBeNull();
    expect(replayMatch(transported).matches).toBe(true);
  });
});
