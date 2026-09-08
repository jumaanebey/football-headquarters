import { GameState, ResourceType, BuildingType, PlayerState } from '../types';
import { INITIAL_BUILDINGS, INITIAL_ROSTER, INITIAL_WALLS, COLLECTOR_CONFIG, collectorCap, collectorRate, tendencyFromId, DEFENSE_TYPES, OPPONENTS, SHIELD_HOURS, energyIntervalMs } from '../constants';
import { HERO_DEFS, simulateRaid, defenseAiTroops, raidAiMult } from '../battle';
import { FormationKey, FORMATIONS, formationUnlocked, anchorsFor, slotsFor, slotUnlocked } from '../fixedBase';
import { trophiesLostOnDefense } from '../ranks';
import { todayKey, freshDailies } from '../dailies';
import { createInitialState, genTeamName } from './initialState';
import { layoutFromFixedBase } from './defenseLayout';
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

      // Credit passive collectors for time spent away (capped per collector config).
      const offlineSecs = Math.max(0, (now - (saved.lastTick || now)) / 1000);
      const buildings = (saved.buildings || INITIAL_BUILDINGS).map(b => {
        // Pull any off-map building back onto the field (cells 2..8 are safely on the diamond).
        let gridX = Math.min(8, Math.max(2, b.gridX));
        let gridY = Math.min(8, Math.max(2, b.gridY));
        // One-time migrations off bad default spots (old defaults crowded/spilled; only fires
        // if the building still sits exactly on an old default, so player moves are respected).
        if (b.id === 'tactics-1' && ((gridX === 3 && gridY === 3) || (gridX === 8 && gridY === 5))) { gridX = 3; gridY = 8; }
        if (b.id === 'med-1' && ((gridX === 2 && gridY === 6) || (gridX === 3 && gridY === 6))) { gridX = 3; gridY = 5; }
        const cfg = COLLECTOR_CONFIG[b.type];
        if (!cfg) return { ...b, gridX, gridY };
        const secs = Math.min(offlineSecs, cfg.maxOfflineSeconds);
        const cap = collectorCap(b.type, b.level);
        const accrued = Math.min(cap, (b.accrued || 0) + collectorRate(b.type, b.level) * secs);
        return { ...b, gridX, gridY, accrued };
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
      var migratedWalls = saved.walls || INITIAL_WALLS; // legacy field (battle still reads it until Stage 4)

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
      // "While you were away" — resolve rival raids against your ACTUAL base for the
      // offline stretch. Base design (levels + Blocking Sleds) changes how they do.
      const formationMastery: Record<string, number> = { ...(saved.formationMastery ?? {}) };
      let defenseLog = [...(saved.defenseLog || [])];
      let coins = (saved.resources?.[ResourceType.COINS] ?? INITIAL_STATE.resources[ResourceType.COINS]) + slotRefund;
      let shieldUntil = saved.shieldUntil || 0;
      let trophies = saved.trophies || 0;
      // A protective shield (earned after a beating) blocks all offline raids until it expires.
      const shielded = now < shieldUntil;
      const numAttacks = (shielded || offlineSecs < 1200) ? 0 : Math.min(3, 1 + Math.floor(offlineSecs / 3600)); // 20min→1, 1h→2, 2h+→3
      if (numAttacks > 0) {
        const stadiumLvl = buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
        const layout = layoutFromFixedBase(buildings, roster, defenseSlots, parkingLot, formation, (saved.formationMastery ?? {})[formation] ?? 0);
        let worstPct = 0;
        for (let a = 0; a < numAttacks; a++) {
          const opp = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
          const res = simulateRaid(layout, defenseAiTroops(), raidAiMult(opp.offenseRating, stadiumLvl));
          const coinsLost = Math.min(coins, Math.round(coins * 0.12 * (res.pct / 100)));
          coins -= coinsLost;
          trophies = Math.max(0, trophies + trophiesLostOnDefense(res.pct)); // storming your stadium costs you rank
          if (res.stars === 0) formationMastery[formation] = (formationMastery[formation] ?? 0) + 1; // HELD → scheme mastery
          worstPct = Math.max(worstPct, res.pct);
          defenseLog.unshift({
            id: `def_${now}_${a}`, attacker: opp.name, at: now - Math.floor(Math.random() * offlineSecs * 1000),
            stars: res.stars, pct: res.pct, coinsLost, seen: false,
          });
        }
        defenseLog = defenseLog.slice(0, 20); // keep the last 20 raids
        // Got roughed up (≥50% taken) → grant a protective shield so you're not farmed.
        if (worstPct >= 50) shieldUntil = now + SHIELD_HOURS * 3600 * 1000;
      }
      // Energy regen used to stop dead while the tab was closed: loadState stamps
      // lastTick = now, so the live ticker saw a zero-length gap and granted nothing.
      // Coins accrued offline but energy didn't, which is inconsistent — and it meant a
      // player who quit below the 12⚡ a game costs came back the next day still unable
      // to play. That is the exact cohort we need to return.
      const medLvl = (saved.buildings || INITIAL_BUILDINGS).find(b => b.type === 'MEDICAL_CENTER')?.level ?? 1;
      const offlineEnergy = Math.floor((offlineSecs * 1000) / energyIntervalMs(medLvl));
      const savedEnergy = (saved.resources || INITIAL_STATE.resources)[ResourceType.ENERGY] ?? 100;
      const energy = Math.min(100, savedEnergy + offlineEnergy);
      const resources = { ...INITIAL_STATE.resources, ...(saved.resources || {}), [ResourceType.COINS]: coins, [ResourceType.ENERGY]: energy };
      // Gauntlet attempts refill with the calendar day (best tier persists).
      const gauntlet = (saved.gauntlet && saved.gauntlet.date === todayKey(now))
        ? saved.gauntlet
        : { best: saved.gauntlet?.best ?? 0, attempts: 3, date: todayKey(now) };
      try { storage.setItem('fhq_save_backup_boot', raw); } catch { /* optional recovery copy */ }
      return { ...INITIAL_STATE, ...saved, buildings, roster, heroes, campaign, dailies, teamName, defenses, inventory, bus, parkingLot, bonusDefSlots, defenseSlots, formation, heroGates: saved.heroGates ?? {}, formationMastery, gauntlet, walls: migratedWalls, resources, defenseLog, shieldUntil, trophies, lastTick: now };
    }
  } catch (e) {
    throw new SaveLoadError('Your saved club could not be read.', { cause: e });
  }
  return INITIAL_STATE;
};
