import { GameState, ResourceType, SeasonPhase } from '../types';
import { INITIAL_BUILDINGS, INITIAL_ROSTER, INITIAL_WALLS, INITIAL_BUILDERS, RECRUIT_LAST_NAMES } from '../constants';
import { HERO_DEFS } from '../battle';
import { anchorsFor } from '../fixedBase';
import { freshDailies, todayKey } from '../dailies';

const TEAM_SUFFIXES = ['Dynasty', 'United', 'Stampede', 'Storm', 'Legion', 'Express'];
export const genTeamName = () => `${RECRUIT_LAST_NAMES[Math.floor(Math.random() * RECRUIT_LAST_NAMES.length)]} ${TEAM_SUFFIXES[Math.floor(Math.random() * TEAM_SUFFIXES.length)]}`;

export const createInitialState = (now = Date.now()): GameState => ({
  resources: {
    [ResourceType.COINS]: 500,
    [ResourceType.GEMS]: 10,
    [ResourceType.ENERGY]: 100,
    [ResourceType.FANS]: 0
  },
  seasonPhase: SeasonPhase.OFF_SEASON,
  teamReadiness: 0,
  currentMatch: 1,
  matchHistory: [],
  // Snap to the starter formation even for brand-new saves — fresh players never
  // pass through loadState's migration, so anchor drift here would ship scrambled.
  buildings: INITIAL_BUILDINGS.map(b => ({ ...b, gridX: anchorsFor('goalline')[b.type].gridX, gridY: anchorsFor('goalline')[b.type].gridY })),
  roster: structuredClone(INITIAL_ROSTER),
  bonusOrbs: [],
  lastTick: now,
  energyProgressMs: 0,
  peakFans: 0,
  timeOfDay: 12, // Noon start
  recruitSlot: null,
  walls: structuredClone(INITIAL_WALLS),
  heroes: HERO_DEFS.map(d => ({ key: d.key, level: 1, unlocked: !!d.starter, stars: 1, shards: 0 })),
  builders: INITIAL_BUILDERS,
  upgrades: [],
  defenseLog: [],
  trophies: 0,
  campaign: { unlocked: 1, stars: {}, claimed: [] },
  teamName: genTeamName(),
  dailies: freshDailies(todayKey(now)),
  defenses: [{ id: 'def-1', kind: 'jugs', gridX: 5, gridY: 4 }], // starter JUGS machine
  inventory: { sleds: 0, defenses: [], bus: false },
  bus: { gridX: 6, gridY: 9 }, // LEGACY — bus is a fixed fixture at BUS_TILE now
  parkingLot: 0,
  bonusDefSlots: 0,
  defenseSlots: { D1: 1 }, // starter JUGS machine lives in its fixed slot
  formation: 'goalline',   // starter scheme; Cover 3 @ Stadium L3, Max Protect @ L5
  heroGates: {},           // gate posts auto-fill with your strongest heroes until assigned
  formationMastery: {},    // holds per formation — tiers at 3/8/15 (+3% defense each)
  gauntlet: { best: 0, attempts: 3, date: todayKey(now) }, // 🛡 attempts refill daily on load
});
