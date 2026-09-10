// server/authorityAdmission.ts
import { BuildingType, DrillState, PlayerRarity, SeasonPhase } from '../types';
import type { GameState, Player, PlayerRole, PlayerStats, UnitGroup, WorldPosition } from '../types';
import { DRILLS, INITIAL_BUILDINGS, INITIAL_ROSTER, MAX_BUILDERS, RARITY_CONFIG, ROLE_UNIT, UNIT_COLOR, tendencyFromId } from '../constants';
import { HERO_DEFS } from '../battle';
import { CAMPAIGN_STAGES } from '../campaign';
import { ALL_QUESTS } from '../dailies';
import { FORMATIONS, FORMATION_ORDER, MAX_SLOT_LEVEL, gatePostsFor, slotsFor } from '../fixedBase';
import type { FormationKey } from '../fixedBase';
import { createInitialState } from '../game/initialState';
import { SAVE_KEY, loadState } from '../game/persistence';
import { parseSavedClub } from '../game/saveValidation';
import { MatchRuleError } from '../game/authority/matches';

/** A parsed local save. Legacy clubs may still carry a campus layout and a recruit board,
 *  which admission strips before the club goes online. */
type SavedClub = GameState & { campusLayout?: unknown; recruitBoard?: unknown };

export type AuthorityClubOrigin = 'new' | 'legacy';

export interface AdmittedClub {
  state: GameState;
  origin: AuthorityClubOrigin;
}

const STAT_KEYS: (keyof PlayerStats)[] = ['strength', 'speed', 'iq'];

const bounded = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const integer = (n: unknown, lo: number, hi: number): n is number => bounded(n, lo, hi) && Number.isSafeInteger(n);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, length = 100): value is string => typeof value === 'string' && value.length > 0 && value.length <= length && !/[\u0000-\u001f\u007f]/u.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const point = (value: unknown): value is WorldPosition => object(value) && ['x', 'y', 'z'].every((key) => bounded(value[key], -1e3, 1e3));
const reject = (): never => {
  throw new MatchRuleError('invalid_legacy', 'This club needs recovery before online protection can be enabled. Your local club has been kept.');
};
const validPlayer = (p: unknown): p is Player =>
  object(p) && text(p.id) && text(p.name) && integer(p.level, 1, 100) && Object.prototype.hasOwnProperty.call(ROLE_UNIT, p.role as PlayerRole) && ROLE_UNIT[p.role as PlayerRole] === p.unit && object(p.stats) && STAT_KEYS.every((key) => bounded((p.stats as Record<string, unknown>)[key], 1, 1e3)) && point(p.worldPos) && point(p.targetPos) && (p.rarity === undefined || Object.values(PlayerRarity).includes(p.rarity as PlayerRarity)) && (p.maxStat === undefined || bounded(p.maxStat, 1, 1e3));

function validatePending(saved: SavedClub, now: number): void {
  const jobs = saved.upgrades ?? [];
  if (jobs.length > 20 || new Set(jobs.map((job) => job.id)).size !== jobs.length || new Set(jobs.map((job) => `${job.kind}:${job.key}`)).size !== jobs.length) return reject();
  for (const job of jobs) {
    const target = job.kind === 'building' ? saved.buildings.find((b) => b.id === job.key) : saved.heroes?.find((h) => h.key === job.key);
    if (!text(job.id) || !target || !integer(job.toLevel, target.level, target.level + 1) || !integer(job.startTime, 0, now) || !integer(job.finishTime, job.startTime, now + 7 * 864e5)) return reject();
  }
  for (const building of saved.buildings) {
    if (building.state === DrillState.ACTIVE || building.state === DrillState.COMPLETED) {
      const drill = building.activeDrillId && Object.prototype.hasOwnProperty.call(DRILLS, building.activeDrillId) ? DRILLS[building.activeDrillId] : null;
      if (building.type !== BuildingType.TRAINING_PITCH || !drill || !Object.values(ROLE_UNIT).includes(building.targetUnit as UnitGroup) || !integer(building.startTime, 0, now) || !integer(building.finishTime, building.startTime, now + 7 * 864e5) || (building.state === DrillState.COMPLETED && building.finishTime > now)) return reject();
    }
  }
  if (saved.recruitSlot != null) {
    const slot = saved.recruitSlot;
    if (!object(slot) || !validPlayer(slot.candidate) || !bounded(slot.cost, 0, 1e9) || !integer(slot.finishTime, 0, now + 7 * 864e5) || saved.roster.some((p) => p.id === slot.candidate.id)) return reject();
  }
}

function pristine(saved: SavedClub, now: number): boolean {
  const fresh = createInitialState(now);
  return saved.currentMatch === 1 && saved.trophies === 0 && saved.teamReadiness === 0 && saved.resources.COINS <= 500 && saved.resources.GEMS <= 10 && saved.resources.FANS === 0 && (saved.peakFans ?? 0) === 0 && (saved.builders ?? fresh.builders) === fresh.builders && (saved.parkingLot ?? 0) === 0 && (saved.bonusDefSlots ?? 0) === 0 && !saved.campusLayout && (!saved.formation || saved.formation === 'goalline') && !saved.recruitSlot && !saved.recruitBoard && !saved.upgrades?.length && !saved.matchHistory?.length && !saved.defenseLog?.length && saved.buildings.length === fresh.buildings.length && saved.buildings.every((b) => b.level === 1 && b.state === DrillState.IDLE) && saved.roster.length === INITIAL_ROSTER.length && saved.roster.every((p) => {
    const initial = INITIAL_ROSTER.find((value) => value.id === p.id);
    return initial && p.level === 1 && p.role === initial.role && p.unit === initial.unit && p.rarity === initial.rarity && STAT_KEYS.every((k) => p.stats[k] === initial.stats[k]);
  }) && (!saved.heroes || (saved.heroes.length === HERO_DEFS.length && saved.heroes.every((h) => h.level === 1 && (h.stars ?? 1) === 1 && (h.shards ?? 0) === 0 && (h.unlocked ?? !!HERO_DEFS.find((d) => d.key === h.key)?.starter) === !!HERO_DEFS.find((d) => d.key === h.key)?.starter))) && (!saved.campaign || (saved.campaign.unlocked === 1 && !Object.keys(saved.campaign.stars).length && !saved.campaign.claimed.length)) && (!saved.gauntlet || (saved.gauntlet.best === 0 && saved.gauntlet.attempts === 3)) && (!saved.dailies || (!Object.values(saved.dailies.progress).some((n) => n > 0) && !saved.dailies.claimed.length && !saved.dailies.sweepClaimed)) && (!saved.formationMastery || !Object.values(saved.formationMastery).some((n) => n > 0)) && (!saved.defenseSlots || Object.entries(saved.defenseSlots).every(([key, n]) => (key === 'D1' ? n === 1 : n === 0)));
}

export function admitClub(legacy: unknown, createdAt: number, activationAt: number, now: number): AdmittedClub {
  if (!integer(now, 0, 864e13) || !integer(createdAt, 0, now) || !integer(activationAt, 0, 864e13)) return reject();
  if (legacy === undefined) return { state: createInitialState(now), origin: 'new' };
  let raw: string, saved: SavedClub;
  try {
    raw = JSON.stringify(legacy);
    if (raw.length > 45e4) return reject();
    saved = parseSavedClub(raw);
  } catch {
    return reject();
  }
  if (!(createdAt < activationAt)) {
    if (!pristine(saved, now)) throw new MatchRuleError('legacy_ineligible', 'This local club predates its online account. Keep playing locally; online protection cannot replace its progress.');
    const state = createInitialState(now);
    state.teamName = (saved.teamName || state.teamName).trim().slice(0, 40);
    return { state, origin: 'new' };
  }
  if (!bounded(saved.resources.COINS, 0, 1e9) || !bounded(saved.resources.GEMS, 0, 1e7) || !bounded(saved.resources.FANS, 0, 1e8) || !bounded(saved.resources.ENERGY, 0, 100) || !integer(saved.lastTick, 0, now) || !integer(saved.currentMatch, 1, 1e7) || !bounded(saved.teamReadiness, 0, 100) || !integer(saved.trophies, 0, 1e7) || (saved.peakFans !== undefined && !bounded(saved.peakFans, 0, 1e8)) || (saved.energyProgressMs !== undefined && !bounded(saved.energyProgressMs, 0, 864e5)) || (saved.shieldUntil !== undefined && !integer(saved.shieldUntil, 0, now + 7 * 864e5)) || !bounded(saved.timeOfDay, 0, 24) || !Object.values(SeasonPhase).includes(saved.seasonPhase) || saved.buildings.length > 20 || new Set(saved.buildings.map((b) => b.id)).size !== saved.buildings.length || !saved.buildings.every((b) => INITIAL_BUILDINGS.some((owned) => owned.id === b.id && owned.type === b.type) && bounded(b.level, 1, 100) && (b.accrued === undefined || bounded(b.accrued, 0, 1e7))) || !saved.roster.length || saved.roster.length > 150 || new Set(saved.roster.map((p) => p.id)).size !== saved.roster.length || !saved.roster.every(validPlayer)) return reject();
  validatePending(saved, now);
  let normalized: SavedClub;
  try {
    const memory = { getItem: (key: string) => (key === SAVE_KEY ? raw : null), setItem: () => {} } as unknown as Storage;
    normalized = loadState(memory, now);
  } catch {
    return reject();
  }
  if (!integer(normalized.builders, 1, MAX_BUILDERS) || !integer(normalized.parkingLot, 0, 3) || !integer(normalized.bonusDefSlots, 0, 3) || !Object.prototype.hasOwnProperty.call(FORMATIONS, normalized.formation) || normalized.heroes.length !== HERO_DEFS.length || new Set(normalized.heroes.map((h) => h.key)).size !== HERO_DEFS.length || !normalized.heroes.every((h) => HERO_DEFS.some((d) => d.key === h.key) && integer(h.level, 1, 100) && integer(h.stars, 1, 5) && integer(h.shards, 0, 1e7) && typeof h.unlocked === 'boolean') || Object.entries(normalized.defenseSlots).some(([key, n]) => !FORMATION_ORDER.some((f) => slotsFor(f).some((slot) => slot.id === key)) || !integer(n, 0, MAX_SLOT_LEVEL)) || Object.entries(normalized.formationMastery).some(([key, n]) => !FORMATION_ORDER.includes(key as FormationKey) || !integer(n, 0, 1e7)) || Object.entries(normalized.heroGates).some(([post, hero]) => !FORMATION_ORDER.some((f) => gatePostsFor(f).some((p) => p.id === post)) || !normalized.heroes.some((h) => h.key === hero && h.unlocked)) || !integer(normalized.gauntlet.best, 0, 20) || !integer(normalized.gauntlet.attempts, 0, 3) || !date(normalized.gauntlet.date) || !integer(normalized.campaign.unlocked, 1, CAMPAIGN_STAGES.length) || Object.entries(normalized.campaign.stars).some(([key, n]) => !integer(Number(key), 1, CAMPAIGN_STAGES.length) || !integer(n, 0, 3)) || normalized.campaign.claimed.some((n) => !integer(n, 1, CAMPAIGN_STAGES.length)) || new Set(normalized.campaign.claimed).size !== normalized.campaign.claimed.length || !date(normalized.dailies.date) || Object.entries(normalized.dailies.progress).some(([key, n]) => !ALL_QUESTS.some((q) => q.id === key) || !bounded(n, 0, 1e8)) || normalized.dailies.claimed.some((key) => !ALL_QUESTS.some((q) => q.id === key)) || new Set(normalized.dailies.claimed).size !== normalized.dailies.claimed.length || normalized.upgrades.length > 20 || normalized.upgrades.some((j) => !bounded(j.toLevel, 1, 100) || !bounded(j.startTime, 0, now) || !bounded(j.finishTime, j.startTime, now + 7 * 864e5))) return reject();
  const state: SavedClub = createInitialState(now);
  for (const key of Object.keys(state) as (keyof GameState)[]) (state as Record<keyof GameState, unknown>)[key] = normalized[key];
  state.campusLayout = normalized.campusLayout;
  state.roster = normalized.roster.map((p) => ({ ...p, rarity: p.rarity ?? PlayerRarity.COMMON, maxStat: p.maxStat ?? RARITY_CONFIG[p.rarity ?? PlayerRarity.COMMON].maxStat, avatarColor: UNIT_COLOR[p.unit], tendency: text(p.tendency, 50) ? p.tendency : tendencyFromId(p.id) }));
  state.recruitSlot = normalized.recruitSlot ? structuredClone(normalized.recruitSlot) : null;
  state.recruitBoard = undefined;
  state.defenseLog = [];
  state.bonusOrbs = [];
  if (!Array.isArray(state.matchHistory) || state.matchHistory.some((m) => !object(m) || !integer(m.week, 1, 1e7) || !text(m.opponent, 200) || !bounded(m.ourScore, 0, 1e3) || !bounded(m.theirScore, 0, 1e3) || typeof m.won !== 'boolean' || !bounded(m.reward, 0, 1e9))) return reject();
  state.matchHistory = state.matchHistory.slice(0, 50);
  state.teamName = state.teamName.trim().slice(0, 40) || 'Football Club';
  state.lastTick = now;
  return { state, origin: 'legacy' };
}
