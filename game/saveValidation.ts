import { BuildingType, GameState, UnitGroup, PlayerRole, PlayerState, DrillState } from '../types';

export class SaveLoadError extends Error {
  readonly cause: unknown;
  constructor(message: string, options?: { cause: unknown }) {
    super(message); this.name = 'SaveLoadError'; this.cause = options?.cause;
  }
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string';
const point = (v: unknown) => object(v) && ['x', 'y', 'z'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]));
const numericMap = (v: unknown) => object(v) && Object.values(v).every(number);
const stringArray = (v: unknown) => Array.isArray(v) && v.every(text);

/** Validate persisted data before migrations or an import can replace a club.
 * Optional versioned fields remain optional so legacy saves still migrate.
 */
export function parseSavedClub(raw: string): GameState {
  const s: unknown = JSON.parse(raw);
  if (!object(s)) throw new SaveLoadError('The save must contain a club.');
  const require = (ok: boolean, field: string) => { if (!ok) throw new SaveLoadError(`Invalid saved ${field}.`); };
  require(object(s.resources) && ['COINS', 'GEMS', 'ENERGY', 'FANS'].every(k => number(s.resources[k])), 'resources');
  require(Array.isArray(s.buildings) && s.buildings.every((b: unknown) => object(b) && text(b.id) && Object.values(BuildingType).includes(b.type) && number(b.level) && b.level >= 1 && Number.isInteger(b.level) && Number.isFinite(b.gridX) && Number.isFinite(b.gridY) && Object.values(DrillState).includes(b.state)), 'facilities');
  require(Array.isArray(s.roster) && s.roster.every((p: unknown) => object(p) && text(p.id) && text(p.name) && number(p.level) && point(p.worldPos) && point(p.targetPos) && Object.values(UnitGroup).includes(p.unit) && Object.values(PlayerRole).includes(p.role) && Object.values(PlayerState).includes(p.state) && object(p.stats) && ['strength', 'speed', 'iq'].every(k => number(p.stats[k]))), 'roster');
  for (const field of ['lastTick', 'timeOfDay', 'trophies', 'builders', 'parkingLot', 'bonusDefSlots', 'shieldUntil']) {
    if (field in s) require(number(s[field]), field);
  }
  if (s.teamName != null) require(text(s.teamName), 'team name');
  if (s.heroes != null) require(Array.isArray(s.heroes) && s.heroes.every((h: unknown) => object(h) && text(h.key) && number(h.level)), 'heroes');
  if ('upgrades' in s) require(Array.isArray(s.upgrades) && s.upgrades.every((u: unknown) => object(u) && text(u.id) && text(u.key) && ['building', 'hero'].includes(u.kind) && number(u.toLevel) && number(u.startTime) && number(u.finishTime)), 'upgrades');
  if (s.campaign != null) require(object(s.campaign) && number(s.campaign.unlocked) && s.campaign.unlocked >= 1 && numericMap(s.campaign.stars) && Array.isArray(s.campaign.claimed) && s.campaign.claimed.every(number), 'campaign');
  if (s.dailies != null) require(object(s.dailies) && text(s.dailies.date) && numericMap(s.dailies.progress) && stringArray(s.dailies.claimed) && typeof s.dailies.sweepClaimed === 'boolean', 'daily practice');
  if (s.gauntlet != null) require(object(s.gauntlet) && text(s.gauntlet.date) && number(s.gauntlet.best) && number(s.gauntlet.attempts), 'Gauntlet');
  for (const field of ['defenseSlots', 'formationMastery']) if (s[field] != null) require(numericMap(s[field]), field);
  for (const field of ['defenseLog', 'walls', 'bonusOrbs', 'matchHistory', 'defenses']) if (field in s) require(Array.isArray(s[field]) && s[field].every(object), field);
  if (s.inventory != null) require(object(s.inventory) && Array.isArray(s.inventory.defenses), 'inventory');
  if (s.heroGates != null) require(object(s.heroGates) && Object.values(s.heroGates).every(text), 'hero assignments');
  return s as unknown as GameState;
}
