// Synthetic club states for the progression read models. Every builder returns a fresh object;
// none of them is a real player's data. Where a rule produces the state (jobs, boards, drills) the
// fixture runs the real authority action so ids, costs and timings are the authority's own.
import { createInitialState } from '../../game/initialState';
import { applyClubAction, type ClubActionContext } from '../../game/authority/clubActions';
import { mulberry32 } from '../../battle';
import { BuildingType, PlayerRarity, PlayerRole, UnitGroup, type GameState, type Player } from '../../types';

export const NOW = Date.UTC(2026, 8, 10, 15); // 2026-09-10T15:00Z
export const DATE = '2026-09-10';

export const context = (now = NOW, seed = 7): ClubActionContext => ({ now, random: mulberry32(seed), calendarDate: DATE });

/** Run an authority action and return the next state; throws on refusal so fixtures cannot silently drift. */
export function act(state: GameState, action: Record<string, unknown>, ctx: ClubActionContext = context(state.lastTick)): { state: GameState; result: Record<string, unknown> } {
  const outcome = applyClubAction(state, action, ctx);
  if (!outcome.ok) throw new Error(`fixture action ${String(action.type)} refused: ${outcome.code} — ${outcome.message}`);
  return { state: outcome.state, result: outcome.result };
}

export function baseState(now = NOW): GameState {
  const s = createInitialState(now);
  s.teamName = 'Fixture Falcons';
  return s;
}

export const withCoins = (s: GameState, coins: number, gems = s.resources.GEMS): GameState => ({ ...s, resources: { ...s.resources, COINS: coins, GEMS: gems } });

export const withStadium = (s: GameState, level: number): GameState => ({ ...s, buildings: s.buildings.map(b => (b.type === BuildingType.STADIUM ? { ...b, level } : b)) });

export const withHero = (s: GameState, key: string, patch: Partial<GameState['heroes'][number]>): GameState =>
  ({ ...s, heroes: s.heroes.map(h => (h.key === key ? { ...h, ...patch } : h)) });

// ── Hero states ────────────────────────────────────────────────────────────────
export const heroLocked = () => withCoins(baseState(), 0, 0);                               // medic: 8000 coins needed
export const heroRecruitable = () => withCoins(baseState(), 8000, 0);                        // medic affordable, legend (120 gems) not
export const heroOwned = () => withCoins(baseState(), 10_000);                               // qb can train
export const heroInsufficient = () => withCoins(baseState(), 0);                             // qb owned, no coins
export const heroMaxed = () => withHero(withCoins(baseState(), 10_000), 'qb', { level: 6 }); // stadium L1 → max 6
export const heroTraining = () => act(heroOwned(), { type: 'hero.train', heroKey: 'qb' }).state; // job for qb runs from NOW
/** The job's finish time has passed but no settlement has happened yet. */
export const heroCompleted = () => heroTraining();
export const heroCompletedNow = () => heroTraining().upgrades[0].finishTime;
export const heroMaxStars = () => withHero(withCoins(baseState(), 10_000), 'qb', { stars: 5, shards: 999 });
export const heroStarReady = () => withHero(withCoins(baseState(), 10_000), 'qb', { stars: 2, shards: 60 }); // 50 needed for 2→3

/** A save written before heroes carried unlocked/stars/shards and before timed upgrades existed. */
export function heroLegacySave(): GameState {
  const s = baseState();
  const legacy = { ...s, heroes: s.heroes.map(({ key, level }) => ({ key, level })) } as unknown as GameState;
  delete (legacy as Partial<GameState>).upgrades;
  return legacy;
}
/** A hero key the club has never seen (a hero added after the save was written). */
export function heroMissingSave(): GameState {
  const s = withCoins(baseState(), 50_000, 500);
  return { ...s, heroes: s.heroes.filter(h => h.key !== 'legend') };
}

/** A second account with different progress; nothing from account A may appear in its model. */
export function otherAccount(): GameState {
  const s = withStadium(withCoins(baseState(NOW + 1), 123, 9), 3);
  s.teamName = 'Other Owls';
  s.heroes = s.heroes.map(h => (h.key === 'qb' ? { ...h, level: 4, stars: 2, shards: 12 } : h.key === 'medic' ? { ...h, unlocked: true } : h));
  return s;
}

// ── Roster / training states ────────────────────────────────────────────────────
export const trainingStarted = () => act(baseState(), { type: 'training.start', drillId: 'sled_push', unit: UnitGroup.OFFENSE_LINE });
export const trainingDue = () => {
  const started = trainingStarted().state;
  const finish = started.buildings.find(b => b.type === BuildingType.TRAINING_PITCH)!.finishTime!;
  return { state: started, finish, settled: act(started, { type: 'sync' }, context(finish)).state };
};

export const legacyPlayer = (s: GameState): GameState => {
  const p = { ...s.roster[0] } as Partial<Player>;
  delete p.rarity; delete p.maxStat;
  return { ...s, roster: [p as Player, ...s.roster.slice(1)] };
};

// ── Scouting states ────────────────────────────────────────────────────────────
export const scoutingBoardState = () => act(withCoins(baseState(), 20_000), { type: 'recruit.refresh' }).state;
export const scoutingJobState = () => {
  const board = scoutingBoardState();
  const candidateId = board.recruitBoard!.candidates[0].id;
  return { candidateId, ...act(board, { type: 'recruit.start', candidateId }) };
};
export const fullRosterState = (): GameState => {
  const s = scoutingBoardState();
  const extra: Player[] = Array.from({ length: 12 - s.roster.length }, (_, i) => ({ ...s.roster[0], id: `fill_${i}`, name: `Fill ${i}` }));
  return { ...s, roster: [...s.roster, ...extra] };
};
export const tiedRosterState = (): GameState => {
  const s = scoutingBoardState();
  // Two OLs with identical stats share the top OL OVR.
  const twin: Player = { ...s.roster[0], id: 'ol_twin', name: 'Twin', stats: { ...s.roster[0].stats } };
  return { ...s, roster: [...s.roster, twin] };
};
export const prospectAt = (s: GameState, role: PlayerRole, rarity = PlayerRarity.RARE): GameState => {
  const candidate = { ...s.recruitBoard!.candidates[0], id: 'srv_prospect_1', role, unit: s.roster.find(p => p.role === role)?.unit ?? UnitGroup.OFFENSE_SKILL, rarity, stats: { strength: 20, speed: 18, iq: 16 } };
  return { ...s, recruitBoard: { ...s.recruitBoard!, candidates: [candidate, ...s.recruitBoard!.candidates.slice(1)] } };
};

// ── Equipment states ───────────────────────────────────────────────────────────
export const equipmentBase = () => withCoins(baseState(), 100_000, 500);
export const equipmentStadium4 = () => withStadium(equipmentBase(), 4);
export const equipmentWithCrown = () => ({ ...equipmentStadium4(), bonusDefSlots: 1 });
export const equipmentMaxed = () => ({ ...withStadium(equipmentBase(), 10), defenseSlots: { D1: 10 } });
export const equipmentLockedButLevelled = () => ({ ...equipmentBase(), defenseSlots: { D1: 1, D3: 2 } }); // D3 needs Stadium 2
