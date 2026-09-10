// Sanitized, synthetic saves for every era the loader supports. None of these is a real player's
// data; identities are invented. Each builder returns the raw object the client of that era wrote
// so migration, idempotence and admission can be asserted against a stable shape.
import { createInitialState } from '../../game/initialState';
import { templateCampusLayout } from '../../game/campusLayout';
import { BuildingType, type GameState } from '../../types';

export const ERA_NOW = Date.UTC(2026, 6, 20, 12); // July 2026, well before the authority activation

const withProgress = (s: GameState) => {
  s.teamName = 'Fixture Falcons';
  s.resources = { COINS: 4321, GEMS: 33, ENERGY: 40, FANS: 900 };
  s.trophies = 180; s.currentMatch = 5; s.teamReadiness = 35;
  s.buildings = s.buildings.map(b => b.type === BuildingType.STADIUM ? { ...b, level: 3, accrued: 120 } : b.type === BuildingType.TRAINING_PITCH ? { ...b, level: 2 } : b);
  s.roster = s.roster.map((p, i) => i === 0 ? { ...p, level: 4, stats: { strength: 13, speed: 13, iq: 13 } } : p);
  s.heroes = s.heroes.map(h => h.key === 'qb' ? { ...h, level: 3 } : h.key === 'medic' ? { ...h, unlocked: true, shards: 5 } : h);
  s.campaign = { unlocked: 4, stars: { 1: 3, 2: 2, 3: 1 }, claimed: [1, 2] };
  s.matchHistory = [{ week: 1, opponent: 'Dust Bowl Prospects', ourScore: 3, theirScore: 0, won: true, reward: 432 }];
  s.defenseLog = [{ id: 'ai_1', attacker: 'Coach Buck Tanner', at: ERA_NOW - 3_600_000, stars: 1, pct: 40, coinsLost: 60, seen: true }];
  s.formationMastery = { goalline: 2 };
  s.lastTick = ERA_NOW;
  return s;
};

/** June 2026: before the fixed base. Free-placed defenses/inventory/walls; heroes without unlocked/stars/shards; no formation, gauntlet or dailies. */
export function preFixedBaseSave(): Record<string, unknown> {
  const s = withProgress(createInitialState(ERA_NOW)) as unknown as Record<string, unknown>;
  delete s.defenseSlots; delete s.formation; delete s.heroGates; delete s.formationMastery; delete s.gauntlet; delete s.dailies; delete s.bonusDefSlots; delete s.parkingLot; delete s.energyProgressMs; delete s.peakFans; delete s.campusLayout;
  s.heroes = (s.heroes as { key: string; level: number }[]).map(({ key, level }) => ({ key, level }));
  s.defenses = [{ id: 'def-1', kind: 'jugs', gridX: 5, gridY: 4 }, { id: 'def-2', kind: 'ref', gridX: 2, gridY: 4 }];
  s.inventory = { sleds: 2, defenses: [{ kind: 'sled' }], bus: false };
  s.walls = [{ gridX: 3, gridY: 3 }, { gridX: 4, gridY: 3 }];
  s.bus = { gridX: 6, gridY: 9 };
  return s;
}
/** July 2026: fixed base with emplacement levels, formations, gate posts, mastery and the Gauntlet. */
export function fixedBaseSave(): Record<string, unknown> {
  const s = withProgress(createInitialState(ERA_NOW)) as unknown as Record<string, unknown>;
  s.defenseSlots = { D1: 2, D3: 1 }; s.formation = 'cover3'; s.heroGates = { south: 'qb' }; s.bonusDefSlots = 0; s.parkingLot = 1;
  delete s.energyProgressMs; delete s.peakFans; delete s.campusLayout; delete s.defenseInbox;
  return s;
}
/** September 2026 (PR #26–#27): return progression fields and the owner-bound live defense cursor. */
export function returnProgressionSave(): Record<string, unknown> {
  const s = fixedBaseSave();
  s.energyProgressMs = 12_000; s.peakFans = 1500;
  s.defenseInbox = { ownerId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-09-09T12:00:00.000Z', id: 7 };
  s.upgrades = [{ id: 'up_1', kind: 'building', key: 'pitch-1', toLevel: 3, startTime: ERA_NOW - 10_000, finishTime: ERA_NOW + 20_000 }];
  return s;
}
/** September 2026 (PR #29/#32): custom campus layout applied by the editor. */
export function campusSave(): Record<string, unknown> {
  const s = returnProgressionSave();
  s.formation = 'goalline';
  const layout = templateCampusLayout('goalline', (s.buildings as GameState['buildings']));
  const scout = layout.facilities.find(f => f.type === BuildingType.YOUTH_ACADEMY)!;
  scout.gridX = 7; scout.gridY = 2;
  s.campusLayout = layout;
  (s.buildings as GameState['buildings']).forEach(b => { const p = layout.facilities.find(f => f.id === b.id); if (p) { b.gridX = p.gridX; b.gridY = p.gridY; } });
  return s;
}
/** September 2026 (PR #29+): the local mirror of a protected club — server-issued board and a server receipt. */
export function protectedMirrorSave(): Record<string, unknown> {
  const s = campusSave();
  s.recruitBoard = { candidates: [], generatedAt: ERA_NOW };
  (s.defenseLog as unknown[]).push({ id: 'c29955db-6477-40ca-9adb-41001e65c120', attacker: 'fhq-authority-evidence-B', attackerPid: '22222222-2222-4222-8222-222222222222', at: ERA_NOW, stars: 3, pct: 100, coinsLost: 119, seen: false, authorityMatchId: 'c29955db-6477-40ca-9adb-41001e65c120', defenseLayoutId: 'campus-v1-d0d6cb7cd6aa9602' });
  return s;
}
/** A save written by a client newer than this one: unknown top-level and nested fields must survive a load/save round trip. */
export function futureSave(): Record<string, unknown> {
  const s = campusSave();
  s.saveSchema = 9; s.futureFeature = { enabled: true, items: [1, 2, 3] };
  (s.heroes as Record<string, unknown>[])[0].talents = ['x'];
  return s;
}
export const CORRUPT_SAVES: [string, string][] = [
  ['truncated JSON', JSON.stringify(fixedBaseSave()).slice(0, 400)],
  ['negative coins', JSON.stringify({ ...fixedBaseSave(), resources: { COINS: -5, GEMS: 0, ENERGY: 0, FANS: 0 } })],
  ['roster not an array', JSON.stringify({ ...fixedBaseSave(), roster: {} })],
  ['facility with unknown type', JSON.stringify({ ...fixedBaseSave(), buildings: [{ id: 'x', type: 'CASINO', level: 1, gridX: 1, gridY: 1, state: 'IDLE' }] })],
  ['campus layout not matching the formation', JSON.stringify({ ...campusSave(), formation: 'cover3' })],
  ['hero level as text', JSON.stringify({ ...fixedBaseSave(), heroes: [{ key: 'qb', level: 'nine' }] })],
];
export const IDENTITY = { teamName: 'Fixture Falcons', coins: 4321, gems: 33, trophies: 180, firstPlayerLevel: 4, qbLevel: 3, medicUnlocked: true, stadiumLevel: 3, claimed: [1, 2] };
