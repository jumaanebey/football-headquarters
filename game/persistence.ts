import { GameState, ResourceType, BuildingType, PlayerState } from '../types';
import { INITIAL_BUILDINGS, INITIAL_ROSTER, INITIAL_WALLS, tendencyFromId, DEFENSE_TYPES } from '../constants';
import { HERO_DEFS } from '../battle';
import { FormationKey, FORMATIONS, formationUnlocked, anchorsFor, slotsFor, slotUnlocked } from '../fixedBase';
import { todayKey, freshDailies } from '../dailies';
import { createInitialState, genTeamName } from './initialState';
import { advanceCampus } from './campus';
import { fanMilestoneTotal } from './fanProgress';
import { parseSavedClub, SaveLoadError } from './saveValidation';
export { SaveLoadError, parseSavedClub } from './saveValidation';
export const SAVE_KEY = 'fhq_save_v1';
export const TUTORIAL_KEY = 'fhq_tutorial_done_v1';

export const loadState = (storage?: Storage, now = Date.now()): GameState => {
  const INITIAL_STATE = createInitialState(now);
  let raw: string | null;
  try {
    storage ??= localStorage;
    raw = storage.getItem(SAVE_KEY);
  } catch {
    // Preserve guest play when the browser disables storage entirely.
    return INITIAL_STATE;
  }
  try {
    if (raw) {
      const saved = parseSavedClub(raw);

      // Normalize old layouts first. Shared campus advancement below handles every
      // elapsed-time effect, including partial energy and upgrades finished away.
      const buildings = (saved.buildings || INITIAL_BUILDINGS).map(b => {
        // Pull any off-map building back onto the field (cells 2..8 are safely on the diamond).
        let gridX = Math.min(8, Math.max(2, b.gridX));
        let gridY = Math.min(8, Math.max(2, b.gridY));
        // One-time migrations off bad default spots (old defaults crowded/spilled; only fires
        // if the building still sits exactly on an old default, so player moves are respected).
        if (b.id === 'tactics-1' && ((gridX === 3 && gridY === 3) || (gridX === 8 && gridY === 5))) { gridX = 3; gridY = 8; }
        if (b.id === 'med-1' && ((gridX === 2 && gridY === 6) || (gridX === 3 && gridY === 6))) { gridX = 3; gridY = 5; }
        return { ...b, gridX, gridY };
      });
      // Backfill buildings added in newer versions (e.g. the Stadium) that older saves lack.
      const presentIds = new Set(buildings.map(b => b.id));
      for (const ib of INITIAL_BUILDINGS) {
        if (!presentIds.has(ib.id)) buildings.push({ ...ib });
      }
      // Reset transient player movement state so no one is stuck mid-walk on load.
      const roster = (saved.roster || INITIAL_ROSTER).map(p => ({ ...p, state: PlayerState.IDLE, targetPos: { ...p.worldPos }, tendency: p.tendency ?? tendencyFromId(p.id) }));
      // Backfill heroes added in newer versions. Old saves lack `unlocked` → starters
      // become unlocked, any newly-added unlockable heroes start locked.
      const heroes = (saved.heroes || []).map((h: any) => ({
        ...h,
        unlocked: h.unlocked ?? HERO_DEFS.find(d => d.key === h.key)?.starter ?? false,
        stars: h.stars ?? 1,
        shards: h.shards ?? 0,
      }));
      const presentHeroKeys = new Set(heroes.map((h: any) => h.key));
      for (const dh of HERO_DEFS) {
        if (!presentHeroKeys.has(dh.key)) {
          heroes.push({ key: dh.key, level: 1, unlocked: !!dh.starter, stars: 1, shards: 0 });
        }
      }
      const campaign = saved.campaign ?? { unlocked: 1, stars: {}, claimed: [] };
      // Daily quests reset when the calendar day changes; team name backfills once.
      const dailies = (saved.dailies && saved.dailies.date === todayKey(now)) ? saved.dailies : freshDailies(todayKey(now));
      const teamName = saved.teamName || genTeamName();
      const defenses = [...(saved.defenses ?? [{ id: 'def-1', kind: 'jugs', gridX: 5, gridY: 4 }])];
      const inventory = { ...(saved.inventory ?? { sleds: 0, defenses: [], bus: false }) };
      inventory.defenses = [...inventory.defenses];
      // Backfill the Team Bus for old saves (it graduated from decor to a movable blocker).
      let bus = saved.bus !== undefined ? saved.bus : (inventory.bus ? null : { gridX: 6, gridY: 9 });
      const parkingLot = saved.parkingLot ?? 0;
      const bonusDefSlots = saved.bonusDefSlots ?? 0;

      // --- FORMATION: which fixed scheme this club runs (default = starter).
      //     If the save somehow holds a formation it hasn't unlocked, fall back.
      const stadiumLvlNow = buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
      let formation: FormationKey = (saved.formation as FormationKey) ?? 'goalline';
      if (!FORMATIONS[formation] || !formationUnlocked(formation, stadiumLvlNow)) formation = 'goalline';

      // --- FIXED BASE: facilities live at the formation's anchors. Positions are
      //     geometry, not player data — every save snaps to its formation's map.
      for (const b of buildings) {
        const a = anchorsFor(formation)[b.type];
        if (a) { b.gridX = a.gridX; b.gridY = a.gridY; }
      }
      const migratedWalls = saved.walls || INITIAL_WALLS;

      // --- FIXED BASE MIGRATION (one-time): owned defense pieces fill their matching
      //     fixed emplacements; anything with no free unlocked slot refunds at FULL
      //     shop price (walls/bus were always free — nothing to refund there).
      let slotRefund = 0;
      let defenseSlots: Record<string, number>;
      if (saved.defenseSlots) {
        defenseSlots = { ...saved.defenseSlots };
      } else {
        defenseSlots = {};
        const ownedKinds = [...defenses.map(d => d.kind), ...inventory.defenses.map(d => d.kind)];
        for (const kind of ownedKinds) {
          const slot = slotsFor(formation).find(s => s.kind === kind && !defenseSlots[s.id] && slotUnlocked(s, stadiumLvlNow, bonusDefSlots));
          if (slot) defenseSlots[slot.id] = 1;
          else slotRefund += DEFENSE_TYPES.find(t => t.kind === kind)?.cost ?? 0;
        }
      }
      // Loading a club is not a match. Preserve recorded history and progress;
      // real received attacks are handled separately by their recorded IDs.
      const formationMastery: Record<string, number> = { ...(saved.formationMastery ?? {}) };
      const defenseLog = [...(saved.defenseLog || [])];
      const coins = (saved.resources?.[ResourceType.COINS] ?? INITIAL_STATE.resources[ResourceType.COINS]) + slotRefund;
      const shieldUntil = saved.shieldUntil || 0;
      const trophies = saved.trophies || 0;
      const resources = { ...INITIAL_STATE.resources, ...(saved.resources || {}), [ResourceType.COINS]: coins };
      // Gauntlet attempts refill with the calendar day (best tier persists).
      const gauntlet = (saved.gauntlet && saved.gauntlet.date === todayKey(now))
        ? saved.gauntlet
        : { best: saved.gauntlet?.best ?? 0, attempts: 3, date: todayKey(now) };
      try { storage.setItem('fhq_save_backup_boot', raw); } catch { /* optional recovery copy */ }
      return advanceCampus({ ...INITIAL_STATE, ...saved, buildings, roster, heroes, campaign, dailies, teamName, defenses, inventory, bus, parkingLot, bonusDefSlots, defenseSlots, formation, heroGates: saved.heroGates ?? {}, formationMastery, gauntlet, walls: migratedWalls, resources, defenseLog, shieldUntil, trophies, lastTick: saved.lastTick ?? now, energyProgressMs: saved.energyProgressMs ?? 0, peakFans: fanMilestoneTotal(saved) }, now);
    }
  } catch (e) {
    throw new SaveLoadError('Your saved club could not be read.', { cause: e });
  }
  return INITIAL_STATE;
};
