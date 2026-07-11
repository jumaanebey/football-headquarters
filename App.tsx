
import React, { useState, useEffect, useRef } from 'react';

// Drops the CC building bar on ANY press outside it — HUD, nav, empty turf, other
// screens' chrome. Buildings are excluded so pressing one just switches the bar.
const ClickAwayCloser: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('[data-ccbar]') || t.closest('[data-fhq-bldg]'))) return;
      onClose();
    };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [onClose]);
  return null;
};
import { GameState, ResourceType, BuildingInstance, BuildingType, DrillState, FloatingText, PlayerState, BonusOrb, SeasonPhase, UnitGroup, MatchResult, Player, UpgradeJob, DefenseLogEntry } from './types';
import { INITIAL_BUILDINGS, DRILLS, INITIAL_ROSTER, VOXEL_CONFIG, RECRUIT_CONFIG, COLLECTOR_CONFIG, collectorRate, collectorCap, RALLY_CONFIG, INITIAL_WALLS, WALL_CAP, INITIAL_BUILDERS, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, energyIntervalMs, trainingXpMult, warRoomReadinessMult, OPPONENTS, SHIELD_HOURS, DEFENSE_TYPES, maxDefenses, RAID_ENERGY, PARKING_LOT, wallCap, buildingTiles, inFootprint, EXTRA_SLOT_COSTS, BUILDING_INFO, UPGRADE_CONFIG } from './constants';
import { rosterCap, recruitSeconds } from './recruiting';
import { sfx, toggleMute, isMuted } from './sound';
import { IsometricMap, screenToTile, BOARD_DIMS } from './components/IsometricMap';
import { TopHUD } from './components/TopHUD';
import { SquadModal } from './components/SquadModal';
import { ActionModal } from './components/ActionModal';
import { ScoutingModal } from './components/ScoutingModal';
import { StandingsModal } from './components/StandingsModal';
import { ClubDashboard } from './components/ClubDashboard';
import { TutorialOverlay } from './components/TutorialOverlay';
import { ObjectiveBanner } from './components/ObjectiveBanner';
import { TourPointer } from './components/TourPointer';
import { GoalId } from './objectives';
import { computeDefenseRating, defenseTroopBoost } from './defense';
import { tendencyFromId, TENDENCIES, TendencyKey, displayAnchorOf } from './constants';
import { generateRaidTargets, EnemyBase } from './battle';
import { rankFor, trophiesForRaid, trophiesLostOnDefense, clubPower } from './ranks';
import { rollHero, RollResult, ROLL_COST_GEMS, STAR_UP_COSTS, MAX_STARS } from './gacha';
import { CAMPAIGN_STAGES, campaignBase, coachForStage, coachForBase, preloadCoachArt, crestForTeam } from './campaign';
import { ALL_QUESTS, questsForDate, freshDailies, todayKey, SWEEP_BONUS_GEMS } from './dailies';
import { pvpEnabled, publishBase, findOpponents, reportAttack, fetchAttacksOnMe, fetchBase, LiveBase, getProfile, linkAccount, signInWithPassword, signOutToGuest, fetchCloudSave, pushCloudSave, deleteCloudData, ProfileInfo } from './pvp';
import { DailyQuestsModal } from './components/DailyQuestsModal';
import { RECRUIT_LAST_NAMES } from './constants';
import { FORMATIONS, FORMATION_ORDER, FormationKey, formationDef, formationUnlocked, anchorsFor, slotsFor, slotById, busTileFor, slotUnlocked, slotUpgradeCost, MAX_SLOT_LEVEL, slotHpMult, slotDmgMult, wallsFor, wallHpFor, gatePostsFor, masteryLevel, masteryDefMult, nextMasteryAt, MASTERY_THRESHOLDS } from './fixedBase';

const TEAM_SUFFIXES = ['Dynasty', 'United', 'Stampede', 'Storm', 'Legion', 'Express'];
const genTeamName = () => `${RECRUIT_LAST_NAMES[Math.floor(Math.random() * RECRUIT_LAST_NAMES.length)]} ${TEAM_SUFFIXES[Math.floor(Math.random() * TEAM_SUFFIXES.length)]}`;
import { BattleScreen, BattleResult, BattleConfig } from './components/BattleScreen';
import { Sheet, Btn, HowTo } from './components/ui';
import { ENEMY_BASES, armyFromRoster, armyStrength, heroesForBattle, HERO_DEFS, heroUpgradeCost, heroMaxLevel, defenseLayoutFromBase, defenseAiTroops, specialsForBattle, simulateRaid, raidAiMult, makeRevengeBase, homeDefenders } from './battle';
import { HeroModal } from './components/HeroModal';
import { DefenseLogModal } from './components/DefenseLogModal';
import { FloatingTextLayer } from './components/FloatingTextLayer';
import { Trophy, Users, Calendar, Volume2, VolumeX, Swords, X, Shield, Star, ClipboardList, Settings as SettingsIcon, Gift } from 'lucide-react';

const INITIAL_STATE: GameState = {
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
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  // Snap to the starter formation even for brand-new saves — fresh players never
  // pass through loadState's migration, so anchor drift here would ship scrambled.
  buildings: INITIAL_BUILDINGS.map(b => ({ ...b, gridX: anchorsFor('goalline')[b.type].gridX, gridY: anchorsFor('goalline')[b.type].gridY })),
  roster: INITIAL_ROSTER,
  bonusOrbs: [],
  lastTick: Date.now(),
  timeOfDay: 12, // Noon start
  recruitSlot: null,
  walls: INITIAL_WALLS,
  heroes: HERO_DEFS.map(d => ({ key: d.key, level: 1, unlocked: !!d.starter, stars: 1, shards: 0 })),
  builders: INITIAL_BUILDERS,
  upgrades: [],
  defenseLog: [],
  trophies: 0,
  campaign: { unlocked: 1, stars: {}, claimed: [] },
  teamName: genTeamName(),
  dailies: freshDailies(),
  defenses: [{ id: 'def-1', kind: 'jugs', gridX: 5, gridY: 4 }], // starter JUGS machine
  inventory: { sleds: 0, defenses: [], bus: false },
  bus: { gridX: 6, gridY: 9 }, // LEGACY — bus is a fixed fixture at BUS_TILE now
  parkingLot: 0,
  bonusDefSlots: 0,
  defenseSlots: { D1: 1 }, // starter JUGS machine lives in its fixed slot
  formation: 'goalline',   // starter scheme; Cover 3 @ Stadium L3, Max Protect @ L5
  heroGates: {},           // gate posts auto-fill with your strongest heroes until assigned
  formationMastery: {}     // holds per formation — tiers at 3/8/15 (+3% defense each)
};

const SAVE_KEY = 'fhq_save_v1';
const TUTORIAL_KEY = 'fhq_tutorial_done_v1';

// FIXED BASE → battle layout: geometry comes from fixedBase.ts, strength from the
// save's LEVELS (facilities, emplacements, parking, fans-adjacent roster boost).
// This is the ONLY path that builds a defense layout — home sim, publish, and test
// all agree by construction.
const layoutFromFixedBase = (
  buildings: BuildingInstance[],
  roster: Player[],
  defenseSlots: Record<string, number>,
  parkingLot: number,
  formation: FormationKey,
  mastery = 0, // holds in THIS formation → +3%/tier on the whole defense
): ReturnType<typeof defenseLayoutFromBase> => {
  const sl = buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
  const emplacements = slotsFor(formation)
    .filter(s => (defenseSlots[s.id] ?? 0) > 0)
    .map(s => ({ id: s.id, kind: s.kind, gridX: s.gridX, gridY: s.gridY, level: defenseSlots[s.id] }));
  return defenseLayoutFromBase(buildings, wallsFor(formation, sl), defenseTroopBoost(roster) * masteryDefMult(mastery), emplacements, busTileFor(formation), parkingLot, wallHpFor(sl), formation);
};

// Load a persisted game, merging over defaults so new fields never come back undefined.
// Absolute drill finishTimes survive reloads as-is; we only reset the loop's tick clock.
const loadState = (): GameState => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as GameState;
      const now = Date.now();
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
        if (!presentIds.has(ib.id)) buildings.push(ib);
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
      const dailies = (saved.dailies && saved.dailies.date === todayKey()) ? saved.dailies : freshDailies();
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
      const resources = { ...INITIAL_STATE.resources, ...(saved.resources || {}), [ResourceType.COINS]: coins };
      return { ...INITIAL_STATE, ...saved, buildings, roster, heroes, campaign, dailies, teamName, defenses, inventory, bus, parkingLot, bonusDefSlots, defenseSlots, formation, heroGates: saved.heroGates ?? {}, formationMastery, walls: migratedWalls, resources, defenseLog, shieldUntil, trophies, lastTick: now };
    }
  } catch (e) {
    console.warn('Save load failed, starting fresh:', e);
  }
  return INITIAL_STATE;
};

function App() {
  const [gameState, setGameState] = useState<GameState>(loadState);
  const [isSquadOpen, setIsSquadOpen] = useState(false);
  const [isScoutingOpen, setIsScoutingOpen] = useState(false);
  const [isStandingsOpen, setIsStandingsOpen] = useState(false);
  const [standingsTab, setStandingsTab] = useState<'live' | 'league' | 'ladder' | undefined>(undefined);
  const [attackSelectOpen, setAttackSelectOpen] = useState(false);
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingInstance | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false); // 🏙 Club Dashboard (tap the jumbotron)
  // CC-style tap: the action bar shows first; Info opens the full sheet.
  const [buildingInfoOpen, setBuildingInfoOpen] = useState(false);
  // 🎉 Upgrade-complete celebration: building id → burst timestamp (IsometricMap renders it)
  const [celebration, setCelebration] = useState<{ id: string; at: number } | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  // 🪙 COIN ARCS: on collect, coins physically fly from the building to the HUD counter.
  // Curved flight = nested X/Y elements with different easing (see fhq-coin-x/y).
  const [coinFlights, setCoinFlights] = useState<{ id: number; x: number; y: number; dx: number; dy: number; delay: number }[]>([]);
  const coinFlightId = useRef(1);
  const spawnCoinArc = (from: { x: number; y: number }, amount: number) => {
    const hud = document.getElementById('hud-coins')?.getBoundingClientRect();
    if (!hud) return;
    const n = Math.max(4, Math.min(9, Math.round(Math.log2(Math.max(2, amount)))));
    const flights = Array.from({ length: n }, (_, i) => ({
      id: coinFlightId.current++,
      x: from.x + (Math.random() * 30 - 15), y: from.y + (Math.random() * 22 - 11),
      dx: hud.left + hud.width / 2 - from.x, dy: hud.top + hud.height / 2 - from.y,
      delay: i * 60,
    }));
    setCoinFlights(prev => [...prev, ...flights]);
    setTimeout(() => sfx.coinLand(), 780); // first coins hit the counter
    setTimeout(() => setCoinFlights(prev => prev.filter(f => !flights.some(g => g.id === f.id))), 1400);
  };
  const [muted, setMuted] = useState(isMuted());
  const [confirmingReset, setConfirmingReset] = useState(false);
  // 🏛 FRONT OFFICE: the one panel that manages the whole defensive layer (fixed base —
  // no placement anywhere; you upgrade slots, the geometry is shared by every club).
  const [frontOfficeOpen, setFrontOfficeOpen] = useState(false);
  const [isHeroOpen, setIsHeroOpen] = useState(false);
  const [defenseLogOpen, setDefenseLogOpen] = useState(false);
  const [raidTargets, setRaidTargets] = useState<EnemyBase[]>([]);
  const [attackTab, setAttackTab] = useState<'season' | 'raid'>('season');
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [liveTargets, setLiveTargets] = useState<LiveBase[]>([]);
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return localStorage.getItem(TUTORIAL_KEY) !== '1'; } catch { return true; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasExported, setHasExported] = useState(() => { try { return localStorage.getItem('fhq_exported_v1') === '1'; } catch { return false; } });
  const [importPending, setImportPending] = useState<Record<string, string | null> | null>(null);

  // 💾 DATA SAFETY: localStorage is the only home your club has — one cleared browser
  // and it's gone. Export bundles everything (save + PvP identity) into a file.
  const exportSave = () => {
    const bundle: Record<string, string | null> = {
      v: '1', exported: new Date().toISOString(),
      fhq_save_v1: localStorage.getItem(SAVE_KEY),
      fhq_pid: localStorage.getItem('fhq_pid'),
      fhq_session_v1: localStorage.getItem('fhq_session_v1'),
      fhq_pvp_since: localStorage.getItem('fhq_pvp_since'),
      fhq_tutorial_done_v1: localStorage.getItem(TUTORIAL_KEY),
      fhq_chalk_intro_v1: localStorage.getItem('fhq_chalk_intro_v1'),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `football-hq-${(gameState.teamName || 'club').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    try { localStorage.setItem('fhq_exported_v1', '1'); } catch { /* ignore */ }
    setHasExported(true);
    spawnText('Club backed up 💾', window.innerWidth / 2, window.innerHeight / 2, '#4ade80');
  };
  const handleImportFile = (file: File) => {
    file.text().then(txt => {
      const b = JSON.parse(txt);
      if (!b || b.v !== '1' || !b.fhq_save_v1) throw new Error('bad bundle');
      JSON.parse(b.fhq_save_v1); // must be valid save JSON
      setImportPending(b); // in-app confirm (never native dialogs)
    }).catch(() => { sfx.error(); spawnText("That file isn't a Football HQ backup", window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); });
  };
  const applyImport = () => {
    if (!importPending) return;
    const KEYS = ['fhq_save_v1', 'fhq_pid', 'fhq_session_v1', 'fhq_pvp_since', 'fhq_tutorial_done_v1', 'fhq_chalk_intro_v1'];
    // The autosave's beforeunload persist would clobber the imported save — write LAST.
    window.addEventListener('beforeunload', () => {
      for (const k of KEYS) {
        const v = (importPending as Record<string, string | null>)[k];
        if (v != null) localStorage.setItem(k, v); // absent keys KEEP current values — a save-only bundle must not wipe your PvP identity
      }
    });
    location.reload();
  };

  const finishTutorial = (teamName: string, startRaid: boolean) => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    setShowTutorial(false);
    setGameState(prev => ({ ...prev, teamName }));
    if (pvpEnabled()) setTimeout(() => publishBase(teamName, gameState.trophies, layoutFromFixedBase(gameState.buildings, gameState.roster, gameState.defenseSlots, gameState.parkingLot, gameState.formation, gameState.formationMastery[gameState.formation] ?? 0)), 400);
    if (startRaid) openRaid();
  };

  // ⌨️ Esc closes the topmost sheet (D5: minimum keyboard support).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (importPending) setImportPending(null);
      else if (settingsOpen) setSettingsOpen(false);
      else if (confirmingReset) setConfirmingReset(false);
      else if (isDailyOpen) setIsDailyOpen(false);
      else if (defenseLogOpen) setDefenseLogOpen(false);
      else if (isHeroOpen) setIsHeroOpen(false);
      else if (isStandingsOpen) setIsStandingsOpen(false);
      else if (isScoutingOpen) setIsScoutingOpen(false);
      else if (isSquadOpen) setIsSquadOpen(false);
      else if (attackSelectOpen) setAttackSelectOpen(false);
      else if (frontOfficeOpen) setFrontOfficeOpen(false);
      else if (selectedBuilding) setSelectedBuilding(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importPending, settingsOpen, confirmingReset, isDailyOpen, defenseLogOpen, isHeroOpen, isStandingsOpen, isScoutingOpen, isSquadOpen, attackSelectOpen, frontOfficeOpen, selectedBuilding]);

  // (The vega300 owner boost — URL param + redeem code — was REMOVED for launch,
  // July 11 2026: cheats must not exist once cloud saves can sync them forever.)

  // ── ☁️ PROFILES & CLOUD SAVES ────────────────────────────────────────────────
  // Anonymous-first: everyone plays instantly on the device identity; linking an
  // email upgrades that SAME identity (uid/pid keep, base + raid history carry).
  // Sync rule: newest wins, and the losing local save is backed up first.
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const profileRef = useRef<ProfileInfo | null>(null);
  profileRef.current = profile;
  const lastCloudPushRef = useRef(0);

  const pushSaveToCloud = async (): Promise<boolean> => {
    const ok = await pushCloudSave(stateRef.current, stateRef.current.teamName || 'Club', clubPower(stateRef.current));
    if (ok) lastCloudPushRef.current = Date.now();
    return ok;
  };

  /** Pull the cloud save; apply it (backup + reload) if it's meaningfully newer,
   *  otherwise push the local club up. force=true always applies cloud (fresh
   *  device sign-in). */
  const syncWithCloud = async (force = false): Promise<'applied' | 'pushed' | 'none'> => {
    const cloud = await fetchCloudSave();
    if (!cloud || !cloud.save) {
      const pushed = await pushSaveToCloud();
      return pushed ? 'pushed' : 'none';
    }
    const cloudTime = Date.parse(cloud.updated_at);
    const localTime = stateRef.current.lastTick ?? 0;
    if (force || cloudTime > localTime + 90000) { // 90s skew guard — ties keep local
      try { localStorage.setItem('fhq_backup_precloud', localStorage.getItem(SAVE_KEY) ?? ''); } catch { /* best effort */ }
      localStorage.setItem(SAVE_KEY, JSON.stringify(cloud.save));
      sessionStorage.setItem('fhq_cloud_applied', '1'); // reload-loop guard
      window.location.reload();
      return 'applied';
    }
    const pushed = await pushSaveToCloud();
    return pushed ? 'pushed' : 'none';
  };

  useEffect(() => {
    if (!pvpEnabled()) return;
    const justApplied = sessionStorage.getItem('fhq_cloud_applied');
    if (justApplied) sessionStorage.removeItem('fhq_cloud_applied');
    getProfile().then(async p => {
      setProfile(p);
      // Linked accounts sync on boot (skip the pull right after applying a
      // cloud save — that reload IS the sync); guests stay local-only.
      if ((p?.email || p?.pendingEmail) && !justApplied) await syncWithCloud();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastUpdateRef = useRef(Date.now());

  // Keep a live ref of state so the autosave interval always writes the latest.
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // --- AUTOSAVE ---
  useEffect(() => {
    const persist = () => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(stateRef.current));
      } catch (e) {
        console.warn('Save failed:', e);
      }
      // ☁️ linked clubs (active OR pending-confirm — same uid either way) trickle
      // up to the cloud once a minute, quietly
      if ((profileRef.current?.email || profileRef.current?.pendingEmail) && Date.now() - lastCloudPushRef.current > 60000) {
        lastCloudPushRef.current = Date.now(); // set BEFORE the await — no double-fire
        pushCloudSave(stateRef.current, stateRef.current.teamName || 'Club', clubPower(stateRef.current)).catch(() => { /* offline — next tick */ });
      }
    };
    const saveLoop = setInterval(persist, 2000);
    window.addEventListener('beforeunload', persist);
    return () => {
      clearInterval(saveLoop);
      window.removeEventListener('beforeunload', persist);
      persist();
    };
  }, []);

  // Warm the coach-portrait cache off the critical path — Game Day used to open to a
  // flash of empty circles while 18 PNGs raced in.
  useEffect(() => {
    const t = setTimeout(preloadCoachArt, 2500);
    return () => clearTimeout(t);
  }, []);

  // --- GAME LOOP ---
  useEffect(() => {
    const loop = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setGameState(prev => {
        // 1. Time Cycle (0-24) - 1 real minute = 1 game day
        const dayProgress = dt / 60;
        const newTime = (prev.timeOfDay + (dayProgress * 24)) % 24;

        // 2. Update Drill Timers + accrue passive collectors
        const updatedBuildings = prev.buildings.map(b => {
          let nb = b;
          if (b.state === DrillState.ACTIVE && b.finishTime && now >= b.finishTime) {
            nb = { ...nb, state: DrillState.COMPLETED };
          }
          const cfg = COLLECTOR_CONFIG[b.type];
          if (cfg) {
            const cap = collectorCap(b.type, b.level);
            const accrued = Math.min(cap, (nb.accrued || 0) + collectorRate(b.type, b.level) * dt);
            nb = { ...nb, accrued };
          }
          return nb;
        });

        // 3. Player AI — off-duty DEFENSIVE players visibly patrol the stadium (your
        //    defense isn't an abstract stat: the guys you recruited walk the beat).
        // Patrol the CENTRAL PRACTICE PATCH — the campus hub. (The stadium is now
        // an off-campus backdrop; patrolling its display anchor would clamp the
        // walkers into a huddle at the board's west edge.)
        const patrolPoint = () => {
          const cx = 55, cy = 55; // practice patch center, world units (tile 5,5)
          const ang = Math.random() * Math.PI * 2, rad = 11 + Math.random() * 6;
          return {
            x: Math.min(94, Math.max(6, cx + Math.cos(ang) * rad)),
            y: Math.min(94, Math.max(6, cy + Math.sin(ang) * rad)),
            z: 0,
          };
        };
        const updatedRoster = prev.roster.map(p => {
          // Idle defender → take up a patrol route around the stadium.
          if (p.state === PlayerState.IDLE && TENDENCIES[p.tendency as TendencyKey]?.side === 'defense') {
            return { ...p, state: PlayerState.PATROLLING, targetPos: patrolPoint() };
          }
          let { x, y } = p.worldPos;
          const { x: tx, y: ty } = p.targetPos;

          const dx = tx - x;
          const dy = ty - y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const patrolling = p.state === PlayerState.PATROLLING;
          const speed = (patrolling ? 6.5 : 15) * dt; // guards amble; trainees hustle

          if (dist > 0.5) {
            x += (dx / dist) * speed;
            y += (dy / dist) * speed;
            return { ...p, worldPos: { x, y, z: 0 }, state: p.targetPos.z === 1 ? PlayerState.TRAINING : patrolling ? PlayerState.PATROLLING : PlayerState.WALKING };
          } else {
             // Arrival: walkers-to-pitch train; patrollers pick the next beat; others idle.
             if (patrolling) return { ...p, targetPos: patrolPoint() };
             if (p.state === PlayerState.WALKING && p.targetPos.z === 1) {
                return { ...p, state: PlayerState.TRAINING };
             }
             if (p.state === PlayerState.WALKING) {
                return { ...p, state: PlayerState.IDLE };
             }
             return p;
          }
        });

        // 4. Energy Regen — slow by default so Energy paces coaching drills; the Rehab
        //    Center (MEDICAL_CENTER) speeds it up, giving that building a real purpose.
        //    Base +1 per 8s (L1) → +1 per 4.8s (L5). (Was a flat 5s with a dead var.)
        const medCenter = prev.buildings.find(b => b.type === 'MEDICAL_CENTER');
        const interval = energyIntervalMs(medCenter ? medCenter.level : 1);

        const newEnergy = (prev.lastTick % interval > now % interval && prev.resources.ENERGY < 100)
            ? Math.min(100, prev.resources.ENERGY + 1)
            : prev.resources.ENERGY;

        // Complete any timed upgrades whose timer elapsed (frees the builder).
        let finalBuildings = updatedBuildings;
        let finalHeroes = prev.heroes;
        let finalUpgrades = prev.upgrades;
        if (prev.upgrades.some(u => now >= u.finishTime)) {
          finalUpgrades = prev.upgrades.filter(u => now < u.finishTime);
          for (const job of prev.upgrades) {
            if (now < job.finishTime) continue;
            if (job.kind === 'building') {
              finalBuildings = finalBuildings.map(b => b.id === job.key ? { ...b, level: job.toLevel } : b);
              // celebrate at the building: burst + fanfare (outside the reducer)
              setTimeout(() => { setCelebration({ id: job.key, at: Date.now() }); sfx.sign(); }, 0);
              setTimeout(() => setCelebration(c => (c && c.id === job.key ? null : c)), 2400);
            }
            else finalHeroes = finalHeroes.map(h => h.key === job.key ? { ...h, level: job.toLevel } : h);
          }
        }

        return {
          ...prev,
          buildings: finalBuildings,
          roster: updatedRoster,
          heroes: finalHeroes,
          upgrades: finalUpgrades,
          resources: { ...prev.resources, [ResourceType.ENERGY]: newEnergy },
          dailies: prev.dailies.date !== todayKey() ? freshDailies() : prev.dailies, // midnight rollover
          timeOfDay: newTime,
          lastTick: now
        };
      });
    }, 100);

    return () => clearInterval(loop);
  }, []);

  const spawnText = (text: string, x: number, y: number, color: string = '#fbbf24') => {
    const id = Date.now() + Math.random();
    setFloatingTexts(prev => [...prev, { id, text, x, y, color }]);
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
    }, 1000);
  };

  // --- HANDLERS ---
  const handleTrainGroup = (unit: UnitGroup, drillId: string) => {
    const drill = DRILLS[drillId];
    if (gameState.resources.ENERGY < drill.costEnergy) {
      spawnText("Low Energy!", window.innerWidth/2, window.innerHeight/2, '#ef4444');
      sfx.error();
      return;
    }

    const freePitch = gameState.buildings.find(b => b.type === 'TRAINING_PITCH' && b.state === DrillState.IDLE);
    if (!freePitch) {
      spawnText("Pitch Busy!", window.innerWidth/2, window.innerHeight/2, '#ef4444');
      sfx.error();
      return;
    }
    sfx.click();

    setGameState(prev => {
      const pitchDA = displayAnchorOf(freePitch); // walk to where the pitch is DRAWN on the home board
      const pitchTargetX = pitchDA.gridX * 10 + 10; // center of the 2×2 practice field
      const pitchTargetY = pitchDA.gridY * 10 + 10;

      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.ENERGY]: prev.resources.ENERGY - drill.costEnergy },
        buildings: prev.buildings.map(b =>
          b.id === freePitch.id
          ? { ...b, state: DrillState.ACTIVE, activeDrillId: drillId, targetUnit: unit, startTime: Date.now(), finishTime: Date.now() + (drill.durationSeconds * 1000) }
          : b
        ),
        roster: prev.roster.map(p => {
          if (drill.targetUnit === 'ALL' || p.unit === unit) { // Full Scrimmage sends EVERYONE
            return { ...p, state: PlayerState.WALKING, targetPos: { x: pitchTargetX + (Math.random()*6 - 3), y: pitchTargetY + (Math.random()*6 - 3), z: 1 } };
          }
          return p;
        })
      };
    });

    setIsSquadOpen(false);
  };

  const handleCollect = (building: BuildingInstance, screenPos: {x: number, y: number}) => {
     if (!building.activeDrillId) return;
     const drill = DRILLS[building.activeDrillId];

     // XP Bonus from the Training Field level (real, wired effect).
     const xpGained = Math.floor(drill.rewardXp * trainingXpMult(building.level));

     setGameState(prev => {
       // War Room (Tactics) sharpens the game plan → more readiness per drill.
       const warRoom = prev.buildings.find(b => b.type === 'TACTICS_ROOM');
       const readinessGain = drill.readinessGain * warRoomReadinessMult(warRoom ? warRoom.level : 1);
       const newReadiness = Math.min(100, prev.teamReadiness + readinessGain);

       return {
         ...prev,
         resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS + drill.rewardCoins },
         teamReadiness: newReadiness,
         roster: prev.roster.map(p => {
           if (drill.targetUnit === 'ALL' || p.unit === building.targetUnit) { // scrimmage trains the whole squad
             return {
               ...p,
               level: p.level + 1,
               stats: { strength: p.stats.strength + 1, speed: p.stats.speed + 1, iq: p.stats.iq + 1 },
               state: PlayerState.IDLE,
               targetPos: { x: p.worldPos.x, y: p.worldPos.y, z: 0 }
             };
           }
           return p;
         }),
         buildings: prev.buildings.map(b => b.id === building.id ? { ...b, state: DrillState.IDLE, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null } : b)
       };
     });

     spawnText(`+${drill.rewardCoins} Coins`, screenPos.x, screenPos.y, '#fbbf24');
     spawnCoinArc(screenPos, drill.rewardCoins);
     spawnText(`+${xpGained} XP`, screenPos.x, screenPos.y - 30, '#3b82f6');
     sfx.collect();
     bumpDaily('drills');
  };

  const newJobId = () => `up_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  // Team Readiness feeds RAIDS now (the legacy auto-sim match is gone): a FIRED UP squad
  // (readiness 100) hits +15% harder, then fatigue drops readiness after any attack.
  const raidPower = (): Record<UnitGroup, number> => {
    const p = armyStrength(gameState.roster);
    if (gameState.teamReadiness >= 100) {
      (Object.keys(p) as UnitGroup[]).forEach(k => { p[k] = Math.min(4.5, p[k] * 1.15); });
    }
    return p;
  };

  const handleUpgradeBuilding = (buildingId: string, cost: number) => {
    const building = gameState.buildings.find(b => b.id === buildingId);
    if (!building) return;
    if (gameState.upgrades.length >= gameState.builders) { spawnText('All builders busy!', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); sfx.error(); return; }
    if (gameState.upgrades.some(u => u.kind === 'building' && u.key === buildingId)) return;
    if (gameState.resources.COINS < cost) { sfx.error(); return; }
    const toLevel = building.level + 1;
    const now = Date.now();
    const job: UpgradeJob = { id: newJobId(), kind: 'building', key: buildingId, toLevel, startTime: now, finishTime: now + upgradeDurationSecs(toLevel) * 1000 };
    setGameState(prev => ({ ...prev, resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost }, upgrades: [...prev.upgrades, job] }));
    setSelectedBuilding(null);
    sfx.click();
    spawnText('Under construction…', window.innerWidth / 2, window.innerHeight / 2, '#60a5fa');
  };

  const handleFinishNow = (jobId: string) => {
    setGameState(prev => {
      const job = prev.upgrades.find(u => u.id === jobId);
      if (!job) return prev;
      const gemCost = skipGemCost(Math.max(0, (job.finishTime - Date.now()) / 1000));
      if (prev.resources.GEMS < gemCost) return prev;
      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - gemCost },
        buildings: job.kind === 'building' ? prev.buildings.map(b => b.id === job.key ? { ...b, level: job.toLevel } : b) : prev.buildings,
        heroes: job.kind === 'hero' ? prev.heroes.map(h => h.key === job.key ? { ...h, level: job.toLevel } : h) : prev.heroes,
        upgrades: prev.upgrades.filter(u => u.id !== jobId),
      };
    });
    setSelectedBuilding(null);
    sfx.upgrade();
    spawnText('Rushed!', window.innerWidth / 2, window.innerHeight / 2, '#a78bfa');
  };

  const handleHireBuilder = () => {
    setGameState(prev => {
      if (prev.builders >= MAX_BUILDERS) return prev;
      const cost = builderHireCost(prev.builders);
      if (prev.resources.GEMS < cost) return prev;
      return { ...prev, resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - cost }, builders: prev.builders + 1 };
    });
    sfx.upgrade();
    spawnText('Builder hired!', window.innerWidth / 2, window.innerHeight / 2, '#4ade80');
  };

  // --- PASSIVE COLLECTORS ---
  const handleCollectResource = (building: BuildingInstance, screenPos: {x: number, y: number}) => {
    const cfg = COLLECTOR_CONFIG[building.type];
    if (!cfg) return;
    const amount = Math.floor(building.accrued || 0);
    if (amount <= 0) return;
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [cfg.resource]: prev.resources[cfg.resource] + amount },
      buildings: prev.buildings.map(b => b.id === building.id ? { ...b, accrued: 0 } : b)
    }));
    const label = cfg.resource === ResourceType.FANS ? 'Fans' : 'Coins';
    spawnText(`+${amount} ${label}`, screenPos.x, screenPos.y, '#fbbf24');
    if (label === 'Coins') spawnCoinArc(screenPos, amount);
    sfx.collect();
    if (cfg.resource === ResourceType.COINS) bumpDaily('bank_coins', amount);
  };

  const handleRally = () => {
    setGameState(prev => {
      if (prev.resources.ENERGY >= 100 || prev.resources.FANS < RALLY_CONFIG.fanCost) return prev;
      return {
        ...prev,
        resources: {
          ...prev.resources,
          [ResourceType.FANS]: prev.resources.FANS - RALLY_CONFIG.fanCost,
          [ResourceType.ENERGY]: Math.min(100, prev.resources.ENERGY + RALLY_CONFIG.energyGain),
        }
      };
    });
    spawnText('Fans fired up! +Energy', window.innerWidth/2, window.innerHeight/2, '#f43f5e');
    sfx.collect();
  };

  // --- RECRUITING ---
  const handleStartRecruit = (candidate: Player, cost: number) => {
    const academy = gameState.buildings.find(b => b.type === BuildingType.YOUTH_ACADEMY);
    if (!academy || gameState.recruitSlot) return;
    if (gameState.roster.length >= rosterCap(academy.level)) {
      spawnText('Roster Full!', window.innerWidth/2, window.innerHeight/2, '#ef4444');
      sfx.error();
      return;
    }
    if (gameState.resources.COINS < cost) {
      spawnText('Not enough coins', window.innerWidth/2, window.innerHeight/2, '#ef4444');
      sfx.error();
      return;
    }
    const secs = recruitSeconds(candidate);
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost },
      recruitSlot: { candidate, cost, finishTime: Date.now() + secs * 1000 }
    }));
    spawnText('Scouting…', window.innerWidth/2, window.innerHeight/2, '#3b82f6');
    sfx.scout();
  };

  const handleRushRecruit = () => {
    setGameState(prev => {
      if (!prev.recruitSlot || prev.resources.GEMS < RECRUIT_CONFIG.rushGemCost) return prev;
      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - RECRUIT_CONFIG.rushGemCost },
        recruitSlot: { ...prev.recruitSlot, finishTime: Date.now() }
      };
    });
  };

  const handleSignRecruit = () => {
    let signedName = '';
    setGameState(prev => {
      if (!prev.recruitSlot || Date.now() < prev.recruitSlot.finishTime) return prev;
      const academy = prev.buildings.find(b => b.type === BuildingType.YOUTH_ACADEMY);
      const cap = academy ? rosterCap(academy.level) : prev.roster.length;
      if (prev.roster.length >= cap) return prev; // safety
      const c = prev.recruitSlot.candidate;
      const spawn = { x: 56 + Math.random() * 10, y: 8 + Math.random() * 10, z: 0 };
      signedName = c.name;
      const signed: Player = { ...c, worldPos: spawn, targetPos: spawn, state: PlayerState.IDLE };
      return { ...prev, roster: [...prev.roster, signed], recruitSlot: null };
    });
    spawnText(`Signed ${signedName || 'Player'}!`, window.innerWidth/2, window.innerHeight/2, '#10b981');
    sfx.sign();
  };

  // Route a tapped Goal (from the Goals panel) to its action.
  const handleGoal = (id: GoalId) => {
    const center = { x: window.innerWidth / 2, y: 320 };
    const find = (t: BuildingType) => gameState.buildings.find(b => b.type === t);
    switch (id) {
      case 'collect-drill': { const d = gameState.buildings.find(b => b.state === DrillState.COMPLETED); if (d) handleCollect(d, center); break; }
      case 'collect-coins': { const st = find(BuildingType.STADIUM); if (st) handleCollectResource(st, center); break; }
      case 'play': openRaid(); break;
      case 'fortify': setFrontOfficeOpen(true); setSelectedBuilding(null); break;
      case 'train': setIsSquadOpen(true); break;
      case 'upgrade': { const st = find(BuildingType.STADIUM); if (st) setSelectedBuilding(st); break; }
      case 'recruit': setIsScoutingOpen(true); break;
      case 'raid': openRaid(); break;
    }
  };

  // Open the Defense Log and mark all entries as seen (clears the nav badge).
  const openDefenseLog = () => {
    setDefenseLogOpen(true);
    if (gameState.defenseLog.some(e => !e.seen)) {
      setGameState(prev => ({ ...prev, defenseLog: prev.defenseLog.map(e => ({ ...e, seen: true })) }));
    }
  };
  const unseenDefenses = gameState.defenseLog.filter(e => !e.seen).length;

  // Open the raid picker with a fresh set of trophy-scaled rivals (no more farming 2 bases).
  // When Live Rivals is connected, also fetch REAL player bases near your trophy count.
  const openRaid = () => {
    setRaidTargets(generateRaidTargets(gameState.trophies));
    setLiveTargets([]);
    if (pvpEnabled()) findOpponents(gameState.trophies).then(setLiveTargets);
    setAttackSelectOpen(true);
  };

  // Take REVENGE on a rival who raided you — storm their (scaled) base for extra loot.
  const handleRevenge = async (entry: DefenseLogEntry) => {
    // LIVE rival? Revenge storms their REAL published base — not a lookalike.
    let buildings = null as import('./battle').BattleBuildingDef[] | null;
    let pvpTarget: string | undefined;
    let title = `Revenge — ${entry.attacker}`;
    if (entry.attackerPid) {
      const base = await fetchBase(entry.attackerPid);
      if (base) {
        buildings = base.layout;
        pvpTarget = base.pid; // they'll see YOUR revenge in their defense log, replay included
        title = `Revenge — ${base.name}`;
      }
    }
    if (!buildings) {
      // Bot raider (or the rival deleted their base): scaled scrimmage stand-in.
      const opp = OPPONENTS.find(o => o.name === entry.attacker);
      buildings = makeRevengeBase(opp?.defenseRating ?? 50);
    }
    const launched = launchAttack({
      mode: 'attack',
      title,
      buildings,
      playerArmy: armyFromRoster(gameState.roster),
      power: raidPower(),
      heroes: heroesForBattle(gameState.heroes),
      specials: specialsForBattle(gameState.resources.FANS),
      // 🔥 FEUD: a rival who's hit you 2+ times pays extra when you finally hit back.
      loot: (() => {
        const hits = gameState.defenseLog.filter(e => (entry.attackerPid ? e.attackerPid === entry.attackerPid : e.attacker === entry.attacker)).length;
        const feud = hits >= 2 ? 1.5 : 1;
        return { coins: Math.round((Math.round(entry.coinsLost * 1.5) + 200) * feud), fans: Math.round(25 * feud) };
      })(),
      rival: entry.attackerPid ? undefined : coachForBase(entry.attacker), // real people speak for themselves
      pvpTarget,
    });
    if (!launched) return;
    setGameState(prev => ({ ...prev, defenseLog: prev.defenseLog.map(e => e.id === entry.id ? { ...e, avenged: true } : e) }));
    setDefenseLogOpen(false);
  };

  // --- BATTLES (real-time raid + base defense) ---
  // Every attack costs Energy — game day isn't free, so loot means something.
  // (Defense scrimmages stay free; you're not choosing to be raided.)
  const launchAttack = (config: BattleConfig): boolean => {
    if (gameState.resources.ENERGY < RAID_ENERGY) {
      spawnText(`Squad's gassed — need ⚡${RAID_ENERGY}`, window.innerWidth / 2, window.innerHeight / 2, '#ef4444');
      sfx.error();
      return false;
    }
    setGameState(prev => ({ ...prev, resources: { ...prev.resources, [ResourceType.ENERGY]: Math.max(0, prev.resources.ENERGY - RAID_ENERGY) } }));
    setBattleConfig({ ...config, attackerName: gameState.teamName, squad: gameState.roster }); // your club + your INDIVIDUALS
    return true;
  };

  const startDefense = () => {
    const coinsAtRisk = Math.min(gameState.resources.COINS, Math.round(gameState.resources.COINS * 0.15) + 120);
    const stadiumLvl = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
    // ⭐ HERO GATES: each gate post is held by its ASSIGNED hero (Front Office), or
    // auto-fills with your strongest available. (75% strength: surprised, not suited up.)
    const posts = gatePostsFor(gameState.formation);
    const pool = heroesForBattle(gameState.heroes).sort((a, b) => b.hp * b.dps - a.hp * a.dps);
    const taken = new Set<string>();
    const heroGuards = posts.map(post => {
      const assigned = pool.find(h => h.key === gameState.heroGates[post.id] && !taken.has(h.key));
      const h = assigned ?? pool.find(hh => !taken.has(hh.key));
      if (!h) return null;
      taken.add(h.key);
      return { jersey: 0, hp: Math.round(h.hp * 0.75), dps: Math.round(h.dps * 0.75 * 10) / 10, name: h.name, art: h.art, unit: h.unit, x: post.gridX * 10 + 5, y: post.gridY * 10 + 5 };
    }).filter(Boolean) as import('./battle').HomeGuardDef[];
    setBattleConfig({
      mode: 'defense',
      title: 'Defend Your Stadium',
      buildings: layoutFromFixedBase(gameState.buildings, gameState.roster, gameState.defenseSlots, gameState.parkingLot, gameState.formation, gameState.formationMastery[gameState.formation] ?? 0),
      preTroops: defenseAiTroops(),
      aiMult: raidAiMult(65, stadiumLvl), // mid-tier live raider; same tuned curve as offline
      homeGuards: [...homeDefenders(gameState.roster, gameState.parkingLot), ...heroGuards], // defenders + heroes, on the field
      fans: gameState.resources.FANS,              // the crowd stalls enemy drives
      parkingLot: gameState.parkingLot,            // visible apron (layout pre-compressed)
      loot: { coins: coinsAtRisk, fans: 0 },
    });
  };

  // ▶ Watch the ACTUAL attack a live rival ran on your base — every deploy is theirs.
  const handleWatchReplay = (entry: DefenseLogEntry) => {
    const rep = entry.replay as import('./battle').ReplayData | undefined;
    if (!rep || rep.v !== 1) return;
    setDefenseLogOpen(false);
    setBattleConfig({
      mode: 'attack',
      title: `${entry.attacker.replace(' ⚡', '')} at your stadium`,
      buildings: rep.layout,
      power: rep.power,
      heroes: rep.heroes,
      specials: rep.specials,
      playerArmy: { [UnitGroup.OFFENSE_LINE]: 99, [UnitGroup.OFFENSE_SKILL]: 99, [UnitGroup.DEFENSE_LINE]: 99, [UnitGroup.DEFENSE_SECONDARY]: 99 }, // spectator: never end early on "out of players"
      loot: { coins: 0, fans: 0 },
      replay: { seed: rep.seed, script: rep.script, planKey: rep.plan },
    });
  };

  const handleBattleFinish = (r: BattleResult) => {
    if (r.isReplay) { setBattleConfig(null); return; } // spectating awards nothing
    if (r.mode === 'attack') {
      const isCampaign = !!r.campaignStage;
      // Raids move the trophy ladder + pay star-gems; campaign pays via first-clear bounties instead.
      const gemReward = isCampaign ? 0 : (r.stars >= 3 ? 5 : r.stars === 2 ? 2 : r.stars === 1 ? 1 : 0);
      const trophyDelta = isCampaign ? 0 : trophiesForRaid(r.won, r.stars);
      const stage = r.campaignStage ?? 0;
      const stageDef = isCampaign ? CAMPAIGN_STAGES[stage - 1] : null;
      setGameState(prev => {
        const firstClear = !!(stageDef && r.won && !prev.campaign.claimed.includes(stage));
        const campaign = isCampaign ? {
          unlocked: r.won ? Math.max(prev.campaign.unlocked, Math.min(CAMPAIGN_STAGES.length, stage + 1)) : prev.campaign.unlocked,
          stars: { ...prev.campaign.stars, [stage]: Math.max(prev.campaign.stars[stage] || 0, r.stars) },
          claimed: firstClear ? [...prev.campaign.claimed, stage] : prev.campaign.claimed,
        } : prev.campaign;
        return {
          ...prev,
          resources: {
            ...prev.resources,
            [ResourceType.COINS]: prev.resources.COINS + r.coins,
            [ResourceType.FANS]: prev.resources.FANS + r.fans,
            [ResourceType.GEMS]: prev.resources.GEMS + gemReward + (firstClear ? stageDef!.firstClear.gems : 0),
          },
          heroes: firstClear
            ? prev.heroes.map(h => h.key === stageDef!.firstClear.shardHero ? { ...h, shards: h.shards + stageDef!.firstClear.shards } : h)
            : prev.heroes,
          campaign,
          matchHistory: [{ week: prev.currentMatch, opponent: r.title.replace('Attacking ', ''), ourScore: r.stars, theirScore: 0, won: r.won, reward: r.coins }, ...prev.matchHistory],
          currentMatch: prev.currentMatch + 1,
          trophies: Math.max(0, prev.trophies + trophyDelta),
          teamReadiness: Math.max(0, prev.teamReadiness - 20), // fatigue after taking the field
          shieldUntil: 0, // going on offense drops your protective shield
        };
      });
      if (r.coins > 0) spawnText(`Gate haul +${r.coins} coins!`, window.innerWidth / 2, window.innerHeight / 2, '#fbbf24');
      if (gemReward > 0) spawnText(`+${gemReward} 👑`, window.innerWidth / 2, window.innerHeight / 2 + 40, '#a855f7');
      if (isCampaign && r.won && stageDef && !gameState.campaign.claimed.includes(stage)) spawnText(`First clear! +${stageDef.firstClear.gems} 👑 +${stageDef.firstClear.shards} shards`, window.innerWidth / 2, window.innerHeight / 2 + 40, '#a855f7');
      if (!isCampaign) spawnText(`${trophyDelta >= 0 ? '+' : ''}${trophyDelta} 🏆`, window.innerWidth / 2, window.innerHeight / 2 + 80, trophyDelta >= 0 ? '#22c55e' : '#ef4444');
      // Daily Practice progress
      if (r.won) bumpDaily('win_attack');
      if (r.stars > 0) bumpDaily('game_balls', r.stars);
      // Rank-up celebration — crossing a trophy tier is a moment.
      const rBefore = rankFor(gameState.trophies).index;
      const after = rankFor(Math.max(0, gameState.trophies + trophyDelta));
      if (after.index > rBefore) {
        spawnText(`RANK UP! ${after.rank.emoji} ${after.rank.name.toUpperCase()}`, window.innerWidth / 2, window.innerHeight / 2 - 60, after.rank.color);
        sfx.victory();
      }
      // LIVE rival raided → their defense log hears about it (with the full replay); republish my base.
      if (r.pvpTarget) reportAttack(r.pvpTarget, gameState.teamName, r.stars, r.pct, r.coins, r.replay);
      setTimeout(publishMyBase, 500);
    } else {
      setGameState(prev => ({
        ...prev,
        resources: { ...prev.resources, [ResourceType.COINS]: Math.max(0, prev.resources.COINS - r.coins) },
      }));
      if (r.coins > 0) spawnText(`−${r.coins} gate revenue lost!`, window.innerWidth / 2, window.innerHeight / 2, '#ef4444');
      else spawnText('Base defended!', window.innerWidth / 2, window.innerHeight / 2, '#10b981');
    }
    if (r.won) sfx.victory(); else sfx.defeat();
    setBattleConfig(null);
  };

  // Heroes TRAIN on a timer — much longer than facility builds (3×), because a player
  // getting better is a grind, not a construction job. Doesn't occupy a builder; one
  // training session per hero at a time. (The job loop + gem-rush already understood
  // kind:'hero' jobs — this finally creates them.)
  const heroTrainSecs = (toLevel: number) => Math.round(upgradeDurationSecs(toLevel) * 3);
  const handleUpgradeHero = (key: string, cost: number) => {
    const h0 = gameState.heroes.find(h => h.key === key);
    const stadLvl0 = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
    const busy = gameState.upgrades.some(u => u.kind === 'hero' && u.key === key);
    const ok = !!h0?.unlocked && !busy && h0.level < heroMaxLevel(stadLvl0) && gameState.resources.COINS >= cost;
    setGameState(prev => {
      const hero = prev.heroes.find(h => h.key === key);
      if (!hero || !hero.unlocked) return prev;
      if (prev.upgrades.some(u => u.kind === 'hero' && u.key === key)) { sfx.error(); return prev; }
      const stadiumLvl = prev.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
      if (hero.level >= heroMaxLevel(stadiumLvl)) { sfx.error(); return prev; }
      if (prev.resources.COINS < cost) { sfx.error(); return prev; }
      const now = Date.now();
      const toLevel = hero.level + 1;
      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost },
        upgrades: [...prev.upgrades, { id: `hj_${now}_${key}`, kind: 'hero' as const, key, toLevel, startTime: now, finishTime: now + heroTrainSecs(toLevel) * 1000 }],
      };
    });
    if (ok) {
      bumpDaily('train_hero');
      sfx.upgrade();
      spawnText('Training session started 🏋️', window.innerWidth / 2, window.innerHeight / 2, '#facc15');
    }
  };

  // --- DAILY PRACTICE (quests) ---
  // Advance a quest's progress if it's on today's slate and unclaimed.
  const bumpDaily = (id: string, n = 1) => {
    setGameState(prev => {
      const active = questsForDate(prev.dailies.date).find(q => q.id === id);
      if (!active || prev.dailies.claimed.includes(id)) return prev;
      const cur = prev.dailies.progress[id] || 0;
      if (cur >= active.target) return prev;
      return { ...prev, dailies: { ...prev.dailies, progress: { ...prev.dailies.progress, [id]: Math.min(active.target, cur + n) } } };
    });
  };

  const handleClaimDaily = (id: string) => {
    setGameState(prev => {
      const slate = questsForDate(prev.dailies.date);
      const q = slate.find(x => x.id === id);
      if (!q || prev.dailies.claimed.includes(id) || (prev.dailies.progress[id] || 0) < q.target) return prev;
      const claimed = [...prev.dailies.claimed, id];
      const sweep = !prev.dailies.sweepClaimed && slate.every(x => claimed.includes(x.id));
      return {
        ...prev,
        resources: {
          ...prev.resources,
          [ResourceType.GEMS]: prev.resources.GEMS + (q.reward.gems || 0) + (sweep ? SWEEP_BONUS_GEMS : 0),
          [ResourceType.COINS]: prev.resources.COINS + (q.reward.coins || 0),
        },
        dailies: { ...prev.dailies, claimed, sweepClaimed: prev.dailies.sweepClaimed || sweep },
      };
    });
    sfx.collect();
    spawnText('Daily reward claimed!', window.innerWidth / 2, window.innerHeight / 2, '#f43f5e');
  };

  const dailyClaimable = questsForDate(gameState.dailies.date)
    .filter(q => (gameState.dailies.progress[q.id] || 0) >= q.target && !gameState.dailies.claimed.includes(q.id)).length;

  // --- LIVE RIVALS (async PvP) ---
  // On load: pull attacks other players landed on my base while I was away.
  useEffect(() => {
    if (!pvpEnabled()) return;
    const since = localStorage.getItem('fhq_pvp_since') || new Date(0).toISOString();
    fetchAttacksOnMe(since).then(attacks => {
      if (!attacks.length) return;
      localStorage.setItem('fhq_pvp_since', attacks[attacks.length - 1].created_at);
      setGameState(prev => {
        // Idempotent by attack id — StrictMode double-mounts this effect in dev.
        const fresh = attacks.filter(a => !prev.defenseLog.some(d => d.id === `pvp_${a.id}`));
        if (!fresh.length) return prev;
        let coins = prev.resources.COINS;
        let trophies = prev.trophies;
        const entries: DefenseLogEntry[] = fresh.map(a => {
          const coinsLost = Math.min(a.coins_lost, Math.round(coins * 0.12));
          coins -= coinsLost;
          trophies = Math.max(0, trophies + trophiesLostOnDefense(a.pct));
          return { id: `pvp_${a.id}`, attacker: `${a.attacker_name} ⚡`, at: Date.parse(a.created_at), stars: a.stars, pct: a.pct, coinsLost, seen: false, replay: a.replay ?? undefined, attackerPid: a.attacker_pid };
        });
        // Every HELD live attack (0 game balls) builds mastery in the scheme you were running
        const holds = fresh.filter(a => a.stars === 0).length;
        const fm = holds > 0 ? { ...prev.formationMastery, [prev.formation]: (prev.formationMastery[prev.formation] ?? 0) + holds } : prev.formationMastery;
        return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: coins }, trophies, formationMastery: fm, defenseLog: [...entries.reverse(), ...prev.defenseLog].slice(0, 20) };
      });
    });
  }, []);

  // Publish my base snapshot so rivals can raid it (on load; also after each battle below).
  const publishMyBase = () => {
    if (!pvpEnabled()) return;
    publishBase(gameState.teamName, gameState.trophies, layoutFromFixedBase(gameState.buildings, gameState.roster, gameState.defenseSlots, gameState.parkingLot, gameState.formation, gameState.formationMastery[gameState.formation] ?? 0));
  };
  useEffect(() => { publishMyBase(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SCOUT SEARCH (hero gacha): spend gems, get a new hero or shards toward a star-up.
  const handleRollHero = () => {
    if (gameState.resources.GEMS < ROLL_COST_GEMS) { sfx.error(); return; }
    const res = rollHero(gameState.heroes);
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - ROLL_COST_GEMS },
      heroes: prev.heroes.map(h => h.key === res.key
        ? (res.isNew ? { ...h, unlocked: true } : { ...h, shards: h.shards + res.shards })
        : h),
    }));
    setLastRoll(res);
    bumpDaily('scout');
    if (res.isNew) sfx.victory(); else sfx.sign();
  };

  // Star-up: spend a hero's banked shards for a big evolution power spike.
  const handleStarUpHero = (key: string) => {
    setGameState(prev => {
      const hero = prev.heroes.find(h => h.key === key);
      if (!hero || !hero.unlocked || hero.stars >= MAX_STARS) return prev;
      const cost = STAR_UP_COSTS[hero.stars];
      if (!cost || hero.shards < cost) { sfx.error(); return prev; }
      return { ...prev, heroes: prev.heroes.map(h => h.key === key ? { ...h, stars: h.stars + 1, shards: h.shards - cost } : h) };
    });
    sfx.upgrade();
    spawnText('⭐ STAR UP!', window.innerWidth / 2, window.innerHeight / 2, '#fde047');
  };

  // Launch a Season campaign stage (deterministic ladder — the PvE spine).
  const startCampaign = (stage: number) => {
    const st = CAMPAIGN_STAGES[stage - 1];
    if (!st || stage > gameState.campaign.unlocked) { sfx.error(); return; }
    const base = campaignBase(stage);
    const launched = launchAttack({
      mode: 'attack',
      title: `${st.name} — ${st.opponent}`,
      buildings: base.buildings,
      playerArmy: armyFromRoster(gameState.roster),
      power: raidPower(),
      heroes: heroesForBattle(gameState.heroes),
      specials: specialsForBattle(gameState.resources.FANS),
      loot: st.reward,
      campaignStage: stage,
      rival: coachForStage(stage),
    });
    if (launched) setAttackSelectOpen(false);
  };

  // Unlock a hero by paying its coin/gem cost.
  const handleUnlockHero = (key: string) => {
    const def = HERO_DEFS.find(d => d.key === key);
    if (!def || !def.unlock) return;
    const { coins = 0, gems = 0 } = def.unlock;
    setGameState(prev => {
      const hero = prev.heroes.find(h => h.key === key);
      if (!hero || hero.unlocked) return prev;
      if (prev.resources.COINS < coins || prev.resources.GEMS < gems) { sfx.error(); return prev; }
      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - coins, [ResourceType.GEMS]: prev.resources.GEMS - gems },
        heroes: prev.heroes.map(h => h.key === key ? { ...h, unlocked: true } : h),
      };
    });
    sfx.sign();
    spawnText(`${def.name} unlocked!`, window.innerWidth / 2, window.innerHeight / 2, '#a855f7');
  };

  // Crown emplacements (C1-C3) unlock in order via bonusDefSlots — a real gem sink.
  const handleBuySlot = () => {
    setGameState(prev => {
      if (prev.bonusDefSlots >= EXTRA_SLOT_COSTS.length) return prev;
      const cost = EXTRA_SLOT_COSTS[prev.bonusDefSlots];
      if (prev.resources.GEMS < cost) { sfx.error(); return prev; }
      return { ...prev, resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - cost }, bonusDefSlots: prev.bonusDefSlots + 1 };
    });
    const ok = gameState.bonusDefSlots < EXTRA_SLOT_COSTS.length && gameState.resources.GEMS >= EXTRA_SLOT_COSTS[gameState.bonusDefSlots];
    if (ok) { sfx.upgrade(); spawnText('+1 equipment slot!', window.innerWidth / 2, window.innerHeight / 2, '#a855f7'); }
  };

  // ✂️ CUT a player — frees a roster spot so you can scout better talent.
  // Floor of 6: you can't cut your way below a fieldable squad.
  const handleCutPlayer = (id: string) => {
    setGameState(prev => {
      if (prev.roster.length <= 6) { sfx.error(); return prev; }
      const p = prev.roster.find(pl => pl.id === id);
      if (!p) return prev;
      return { ...prev, roster: prev.roster.filter(pl => pl.id !== id) };
    });
    if (gameState.roster.length > 6) { sfx.click(); spawnText('Released to free agency ✂️', window.innerWidth / 2, window.innerHeight / 2, '#94a3b8'); }
  };

  // 🧪 TEST DEFENSE: run a scrimmage against your own base — see the Front Office
  // upgrades actually fight.
  const handleTestDefense = () => {
    setFrontOfficeOpen(false);
    startDefense();
  };

  // 🗺 Mini layout preview — drawn from the REAL formation geometry, so what you
  // see on the card is exactly the base you'll defend.
  const FormationPreview = ({ f }: { f: FormationKey }) => {
    const cells: Record<string, string> = {};
    for (const w of wallsFor(f, 12)) cells[`${w.gridX},${w.gridY}`] = '#475569';
    for (const sl of slotsFor(f)) cells[`${sl.gridX},${sl.gridY}`] = '#b91c1c';
    const bt = busTileFor(f); cells[`${bt.gridX},${bt.gridY}`] = '#7c2d12';
    const an = anchorsFor(f);
    for (const t of Object.keys(an) as BuildingType[]) {
      const a = an[t]; const col = t === BuildingType.STADIUM ? '#22c55e' : '#f97316';
      for (const [tx, ty] of buildingTiles(a.gridX, a.gridY)) cells[`${tx},${ty}`] = col;
    }
    return (
      <div className="grid mt-1.5 rounded overflow-hidden border border-slate-700/60" style={{ gridTemplateColumns: 'repeat(10, 1fr)', width: 70, height: 70 }}>
        {Array.from({ length: 100 }).map((_, i) => {
          const x = i % 10, y = Math.floor(i / 10);
          return <div key={i} style={{ background: cells[`${x},${y}`] ?? '#14532d' }} />;
        })}
      </div>
    );
  };

  // 📋 CALL A FORMATION — free to switch; slot levels carry, only geometry moves.
  const handleSetFormation = (key: FormationKey) => {
    if (!formationUnlocked(key, stadiumLevel)) { sfx.error(); return; }
    if (key === gameState.formation) return;
    setGameState(prev => ({
      ...prev,
      formation: key,
      buildings: prev.buildings.map(b => { const a = anchorsFor(key)[b.type]; return a ? { ...b, gridX: a.gridX, gridY: a.gridY } : b; }),
    }));
    sfx.whoosh(); // buildings glide to their new anchors
    spawnText(`${formationDef(key).name} — new scheme called! 📋`, window.innerWidth / 2, window.innerHeight / 2, '#38bdf8');
    setTimeout(publishMyBase, 500);
  };

  // ⭐ Assign a hero to a gate post (one gate per hero — reassigning moves them).
  const handleAssignHeroGate = (postId: string, heroKey: string) => {
    setGameState(prev => {
      const next: Record<string, string> = { ...prev.heroGates };
      for (const k of Object.keys(next)) if (next[k] === heroKey) delete next[k]; // one post per hero
      next[postId] = heroKey;
      return { ...prev, heroGates: next };
    });
    sfx.click();
  };

  // 🏛 FRONT OFFICE — activate or upgrade a fixed defense emplacement.
  // Level 0→1 costs the kind's shop price; higher levels follow the slot ladder.
  // Emplacement level can never exceed your Stadium level (same gate as facilities).
  const handleUpgradeSlot = (slotId: string) => {
    const slot = slotById(gameState.formation, slotId);
    if (!slot) return;
    const cur = gameState.defenseSlots[slotId] ?? 0;
    const toLevel = cur + 1;
    const t = DEFENSE_TYPES.find(x => x.kind === slot.kind)!;
    if (!slotUnlocked(slot, stadiumLevel, gameState.bonusDefSlots)) { sfx.error(); return; }
    if (toLevel > MAX_SLOT_LEVEL) return;
    if (toLevel > stadiumLevel) { sfx.error(); spawnText(`Upgrade your Stadium to L${toLevel} first`, window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return; }
    const cost = slotUpgradeCost(slot.kind, toLevel);
    if (gameState.resources.COINS < cost) { sfx.error(); spawnText('Need coins', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return; }
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost },
      defenseSlots: { ...prev.defenseSlots, [slotId]: toLevel },
    }));
    sfx.upgrade();
    spawnText(cur === 0 ? `${t.name} installed!` : `${t.name} → L${toLevel}!`, window.innerWidth / 2, window.innerHeight / 2, '#4ade80');
    setTimeout(publishMyBase, 500);
  };

  // 🅿️ Pave the next Parking Lot level — territory that stretches the raiders' approach.
  const handlePaveParkingLot = () => {
    setGameState(prev => {
      if (prev.parkingLot >= PARKING_LOT.maxLevel) return prev;
      const cost = PARKING_LOT.costs[prev.parkingLot];
      if (prev.resources.COINS < cost) { sfx.error(); return prev; }
      return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost }, parkingLot: prev.parkingLot + 1 };
    });
    const affordable = gameState.parkingLot < PARKING_LOT.maxLevel && gameState.resources.COINS >= PARKING_LOT.costs[gameState.parkingLot];
    if (affordable) { sfx.upgrade(); spawnText('🅿️ Parking Lot paved — longer approach for raiders!', window.innerWidth / 2, window.innerHeight / 2, '#4ade80'); setTimeout(publishMyBase, 500); }
  };

  const handleResetGame = () => {
      try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(TUTORIAL_KEY); } catch (e) { /* ignore */ }
      setGameState({ ...INITIAL_STATE, lastTick: Date.now() });
      lastUpdateRef.current = Date.now();
      setSelectedBuilding(null);
      setConfirmingReset(false);
      setShowTutorial(true);
      spawnText("New Franchise!", window.innerWidth/2, window.innerHeight/2, '#fbbf24');
  };

  const stadiumLevel = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans select-none">
      {showTutorial && <TutorialOverlay initialName={gameState.teamName} onRerollName={genTeamName} onDone={finishTutorial} />}

      <TopHUD gameState={gameState} onRally={handleRally} onOpenRanks={() => { setStandingsTab('ladder'); setIsStandingsOpen(true); }} />

      <IsometricMap
        buildings={gameState.buildings}
        players={gameState.roster}
        bonusOrbs={gameState.bonusOrbs}
        timeOfDay={gameState.timeOfDay}
        recruitSlot={gameState.recruitSlot}
        upgrades={gameState.upgrades}
        formationName={formationDef(gameState.formation).name}
        rankColor={rankFor(gameState.trophies).rank.color}
        rankName={rankFor(gameState.trophies).rank.name}
        clubName={gameState.teamName}
        trophies={gameState.trophies}
        fans={Math.floor(gameState.resources[ResourceType.FANS] ?? 0)}
        selectedId={selectedBuilding?.id ?? null}
        celebrationId={celebration?.id ?? null}
        onDeselect={() => { setSelectedBuilding(null); setBuildingInfoOpen(false); }}
        onOpenStats={() => { sfx.click(); setDashboardOpen(true); }}
        onBuildingClick={(b) => {
          if (b.type === BuildingType.YOUTH_ACADEMY) setIsScoutingOpen(true);
          else { setSelectedBuilding(b); setBuildingInfoOpen(false); sfx.click(); }
        }}
        onCollect={handleCollect}
        onCollectResource={handleCollectResource}
        onOrbClick={() => {}}
      />

      <FloatingTextLayer items={floatingTexts} />
      {/* coin flights: outer = X easing, inner = Y easing → curved arc to the HUD */}
      {coinFlights.map(f => (
        <span key={f.id} className="fixed pointer-events-none" style={{ left: f.x, top: f.y, zIndex: 95, animation: `fhq-coin-x 0.75s cubic-bezier(0.55,0,1,0.45) ${f.delay}ms forwards` , ['--dx' as string]: `${f.dx}px` } as React.CSSProperties}>
          <img src="/assets/icons/coins.png" alt="" draggable={false} className="w-5 h-5 select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
            style={{ animation: `fhq-coin-y 0.75s cubic-bezier(0,0.55,0.45,1) ${f.delay}ms forwards`, ['--dy' as string]: `${f.dy}px` } as React.CSSProperties} />
        </span>
      ))}

      {isSquadOpen && (
        <SquadModal
          roster={gameState.roster}
          resources={gameState.resources}
          heroes={gameState.heroes}
          upgrades={gameState.upgrades}
          stadiumLevel={stadiumLevel}
          onClose={() => setIsSquadOpen(false)}
          onTrainGroup={handleTrainGroup}
          onTrainHero={handleUpgradeHero}
          onCutPlayer={handleCutPlayer}
          onOpenHeroes={() => { setIsSquadOpen(false); setIsHeroOpen(true); }}
        />
      )}

      {selectedBuilding && buildingInfoOpen && (
          <ActionModal
             building={selectedBuilding}
             resources={gameState.resources}
             stadiumLevel={stadiumLevel}
             upgrades={gameState.upgrades}
             builders={gameState.builders}
             onClose={() => { setSelectedBuilding(null); setBuildingInfoOpen(false); }}
             onUpgrade={handleUpgradeBuilding}
             onFinishNow={handleFinishNow}
             onHireBuilder={handleHireBuilder}
          />
      )}

      {/* 🏰 CC-style building bar: tap a building → it stays in view with a spotlight,
          title + upgrade cost over the board, chunky actions below. Info opens the sheet. */}
      {/* CLICK-AWAY COLLAPSE (Jumaane): any press outside the CC bar and outside a
          building drops the bar — HUD, nav, empty turf, anywhere. Buildings keep
          their own click handling (pressing another building just switches the bar). */}
      {selectedBuilding && !buildingInfoOpen && <ClickAwayCloser onClose={() => { setSelectedBuilding(null); setBuildingInfoOpen(false); }} />}
      {selectedBuilding && !buildingInfoOpen && (() => {
        const b = gameState.buildings.find(x => x.id === selectedBuilding.id) ?? selectedBuilding;
        const info = BUILDING_INFO[b.type];
        const cost = Math.floor(UPGRADE_CONFIG.baseCost * Math.pow(UPGRADE_CONFIG.costMultiplier, b.level - 1));
        const isStadium = b.type === BuildingType.STADIUM;
        const gated = !isStadium && b.level >= stadiumLevel;
        const busy = gameState.upgrades.some(u => u.kind === 'building' && u.key === b.id);
        const canAfford = gameState.resources.COINS >= cost;
        const CCBtn = ({ label, emoji, onClick, disabled, accent }: { label: string; emoji: string; onClick: () => void; disabled?: boolean; accent?: boolean }) => (
          <button onClick={onClick} disabled={disabled}
            className={`flex flex-col items-center gap-1 w-[74px] py-2.5 rounded-xl border-2 shadow-xl transition-all active:scale-90 pointer-events-auto
              ${disabled ? 'border-slate-700 bg-slate-900/90 opacity-50' : accent ? 'border-yellow-500 bg-gradient-to-b from-slate-800 to-slate-900 hover:border-yellow-300' : 'border-slate-600 bg-gradient-to-b from-slate-800 to-slate-900 hover:border-slate-400'}`}>
            <span className="text-2xl leading-none drop-shadow">{emoji}</span>
            <span className="text-[10px] font-black uppercase text-white leading-none">{label}</span>
          </button>
        );
        return (
          <div data-ccbar className="fixed left-0 right-0 z-40 flex flex-col items-center gap-1.5 pointer-events-none animate-fade-in" style={{ bottom: 96 }}>
            <div className="font-display font-black text-white text-xl sm:text-2xl uppercase tracking-tight text-center px-3" style={{ textShadow: '0 2px 6px #000, 0 0 14px rgba(0,0,0,0.8)' }}>
              {info.name} <span className="text-yellow-300">(Level {b.level})</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-mono font-bold" style={{ textShadow: '0 1px 4px #000' }}>
              {busy ? <span className="text-amber-300">🔨 upgrading…</span>
                : gated ? <span className="text-slate-300">🔒 needs Stadium L{b.level + 1}</span>
                : <><img src="/assets/icons/coins.png" alt="" className="w-4 h-4" draggable={false} /><span className={canAfford ? 'text-yellow-300' : 'text-red-400'}>{cost.toLocaleString()}</span></>}
            </div>
            <div className="flex items-end gap-2 mt-1">
              <CCBtn label="Info" emoji="💬" onClick={() => setBuildingInfoOpen(true)} />
              <CCBtn label="Level Up" emoji="🔨" accent disabled={busy || gated || !canAfford} onClick={() => { handleUpgradeBuilding(b.id, cost); }} />
              {isStadium && <CCBtn label="Defense" emoji="🛡️" onClick={() => { setSelectedBuilding(null); setFrontOfficeOpen(true); }} />}
              {b.type === BuildingType.TACTICS_ROOM && <CCBtn label="Game Day" emoji="⚔️" onClick={() => { setSelectedBuilding(null); setAttackSelectOpen(true); }} />}
            </div>
          </div>
        );
      })()}

      {isStandingsOpen && (
        <StandingsModal
          gameState={gameState}
          initialTab={standingsTab}
          onClose={() => { setIsStandingsOpen(false); setStandingsTab(undefined); }}
          onPlay={() => { setIsStandingsOpen(false); setStandingsTab(undefined); openRaid(); }}
        />
      )}

      {/* 🏙 Club Dashboard — SimCity advisor panel, opened from the jumbotron */}
      {dashboardOpen && <ClubDashboard gs={gameState} onClose={() => setDashboardOpen(false)} />}

      {/* Attack: Season campaign ladder or a live Raid */}
      {attackSelectOpen && (
        <Sheet
          title={<>Game Day <span className="text-[12px] font-sans font-bold normal-case tracking-normal text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5" title="Suiting up costs Energy — regen at the Rehab Center">⚡{RAID_ENERGY} per game</span></>}
          icon={<Swords className="text-red-500" size={22} />}
          onClose={() => setAttackSelectOpen(false)}
          maxWidth="max-w-md"
        >
          <div className="p-5 pt-3 flex flex-col max-h-full">
            {/* Mode tabs */}
            <div className="flex gap-2 mb-2">
              <button onClick={() => setAttackTab('season')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${attackTab === 'season' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                🏆 Season {gameState.campaign.unlocked > CAMPAIGN_STAGES.length ? '✓' : `${Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length)}/${CAMPAIGN_STAGES.length}`}
              </button>
              <button onClick={() => setAttackTab('raid')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${attackTab === 'raid' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                ⚔️ Raid
              </button>
            </div>
            {/* 🛡 Defend — your side of game day, right where the action lives */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setAttackSelectOpen(false); openDefenseLog(); }}
                className="flex-1 py-2 rounded-xl font-bold text-sm transition-colors bg-slate-800 text-sky-300 hover:bg-slate-700 border border-sky-900/60 relative">
                🛡 Defense Log
                {unseenDefenses > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-sky-500 border-2 border-slate-900 text-[11px] font-bold text-white inline-flex items-center justify-center leading-none">{unseenDefenses}</span>}
              </button>
              <button onClick={() => { setAttackSelectOpen(false); handleTestDefense(); }}
                className="flex-1 py-2 rounded-xl font-bold text-sm transition-colors bg-slate-800 text-green-300 hover:bg-slate-700 border border-green-900/60">
                🧪 Test Defense
              </button>
            </div>
            <div className="mb-3">
              <HowTo id="gameday" lines={[
                'SEASON: beat 12 rival coaches for the ring — earn up to 3 game balls per matchup.',
                'RAID: hit rival bases for Coins and Fans. ⚡ Live Rivals are real coaches — beating them takes trophies.',
                'Every game costs ⚡12 Energy. In battle: drop players near a lane, then direct the drive with plays and hero abilities.',
                'DEFENSE LOG shows who raided you while you were away — watch the film and take revenge.',
              ]} />
            </div>

            {attackTab === 'season' ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {CAMPAIGN_STAGES.map(st => {
                  const locked = st.stage > gameState.campaign.unlocked;
                  const earned = gameState.campaign.stars[st.stage] || 0;
                  const cleared = gameState.campaign.claimed.includes(st.stage);
                  const coach = coachForStage(st.stage);
                  const isNext = !locked && st.stage === Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length) && !cleared;
                  return (
                    <button key={st.stage} onClick={() => !locked && startCampaign(st.stage)} disabled={locked}
                      className={`w-full flex items-center justify-between gap-2 p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]
                        ${locked ? 'border-slate-800 bg-slate-900/40 opacity-45 cursor-not-allowed' : isNext ? 'border-orange-500 bg-slate-800 hover:bg-slate-700/70' : 'border-slate-700 hover:border-orange-500 bg-slate-800 hover:bg-slate-700/70'}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-xl" style={{ background: `radial-gradient(circle at 35% 30%, ${coach.color}bb, #0f172a 90%)`, border: `2px solid ${locked ? '#334155' : coach.color}`, filter: locked ? 'grayscale(1)' : undefined }}>
                          <span className="absolute inset-0 flex items-center justify-center">{coach.emoji}</span>
                          <img src={coach.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{locked ? '🔒 ' : ''}{st.name}{isNext && <span className="ml-2 text-[9px] font-black uppercase bg-orange-500 text-white px-1.5 py-0.5 rounded align-middle">Next</span>}</div>
                          <div className="text-xs text-slate-400 truncate">{st.opponent} · {coach.name}</div>
                          <div className="text-sm leading-none mt-1">
                            {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < earned ? 1 : 0.22, filter: i < earned ? 'none' : 'grayscale(1)' }}>🏈</span>)}
                          </div>
                          {isNext && <div className="text-[10px] italic text-orange-200/80 mt-1 line-clamp-2">“{coach.intro}”</div>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end">
                        <img src={crestForTeam(st.opponent)} alt="" draggable={false}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          className="w-7 h-7 object-contain mb-0.5 select-none" style={{ filter: locked ? 'grayscale(1) opacity(0.5)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                        <div className="text-yellow-400 font-mono font-bold text-sm">+{st.reward.coins}</div>
                        {!cleared && !locked && <div className="text-[10px] text-purple-300 font-bold">1st: +{st.firstClear.gems}👑 +{st.firstClear.shards}🧩</div>}
                        {cleared && <div className="text-[10px] text-green-500 font-bold">CLEARED</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              {/* LIVE RIVALS — real players' published bases (async PvP) */}
              {liveTargets.length > 0 && (
                <>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-fuchsia-300 flex items-center gap-1.5">⚡ Live Rivals <span className="text-slate-500 normal-case tracking-normal">— real coaches' stadiums</span></div>
                  {liveTargets.map(b => (
                    <button key={b.pid} onClick={() => { if (launchAttack({ mode: 'attack', title: `Raiding ${b.name}`, buildings: b.layout, playerArmy: armyFromRoster(gameState.roster), power: raidPower(), heroes: heroesForBattle(gameState.heroes), specials: specialsForBattle(gameState.resources.FANS), loot: { coins: 500 + b.trophies * 3, fans: 25 }, pvpTarget: b.pid })) setAttackSelectOpen(false); }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-fuchsia-700/70 hover:border-fuchsia-400 bg-fuchsia-950/30 hover:bg-fuchsia-900/30 transition-all active:scale-95 text-left">
                      <div>
                        <div className="font-bold text-white text-lg">⚡ {b.name}</div>
                        <div className="text-xs text-fuchsia-200/70">🏆 {b.trophies} · {b.layout.filter(x => x.kind !== 'wall').length} buildings · live player{(() => { const f = b.layout.find(x => x.kind === 'hq')?.formation; return f && FORMATIONS[f as FormationKey] ? <span className="text-sky-300 font-bold"> · 📋 {FORMATIONS[f as FormationKey].name}</span> : null; })()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-yellow-400 font-mono font-bold">+{500 + b.trophies * 3}</div>
                        <div className="text-[10px] text-slate-500 uppercase">max loot</div>
                      </div>
                    </button>
                  ))}
                  <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 pt-1">Scrimmage bots</div>
                </>
              )}
              {!pvpEnabled() && (
                <div className="text-[11px] text-slate-500 border border-slate-800 rounded-lg px-3 py-2">🌐 <span className="text-slate-400 font-bold">Live Rivals</span> not connected — raid real players by wiring Supabase (see <span className="font-mono">PVP-SETUP.md</span>).</div>
              )}
              {raidTargets.map(b => (
                <button key={b.id} onClick={() => { if (launchAttack({ mode: 'attack', title: `Attacking ${b.name}`, buildings: b.buildings, playerArmy: armyFromRoster(gameState.roster), power: raidPower(), heroes: heroesForBattle(gameState.heroes), specials: specialsForBattle(gameState.resources.FANS), loot: b.reward, rival: coachForBase(b.name) })) setAttackSelectOpen(false); }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-slate-700 hover:border-red-500 bg-slate-800 hover:bg-slate-700/70 transition-all active:scale-95 text-left">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={crestForTeam(b.name)} alt="" draggable={false}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      className="w-9 h-9 object-contain shrink-0 select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
                  <div>
                    <div className="font-bold text-white text-lg">{b.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      {Array.from({ length: Math.max(1, Math.min(5, Math.round(b.difficulty))) }).map((_, i) => <Swords key={i} size={11} className="text-red-400 inline" />)}
                      <span>• {b.buildings.filter(x => x.kind !== 'wall').length} buildings</span>
                      {(() => { const f = b.buildings.find(x => x.kind === 'hq')?.formation; return f && FORMATIONS[f as FormationKey] ? <span className="text-sky-300 font-bold">• 📋 {FORMATIONS[f as FormationKey].name}</span> : null; })()}
                    </div>
                  </div>
                  </div>
                  <div className="text-right">
                    <div className="text-yellow-400 font-mono font-bold">+{b.reward.coins}</div>
                    <div className="text-[10px] text-slate-500 uppercase">max loot</div>
                  </div>
                </button>
              ))}
            </div>
            )}
          </div>
        </Sheet>
      )}

      {battleConfig && (
        <BattleScreen
          config={battleConfig}
          onFinish={handleBattleFinish}
          onExit={() => setBattleConfig(null)}
        />
      )}

      {isHeroOpen && (
        <HeroModal
          heroes={gameState.heroes}
          resources={gameState.resources}
          stadiumLevel={stadiumLevel}
          lastRoll={lastRoll}
          onClose={() => { setIsHeroOpen(false); setLastRoll(null); }}
          onUpgrade={handleUpgradeHero}
          onUnlock={handleUnlockHero}
          onRoll={handleRollHero}
          onStarUp={handleStarUpHero}
        />
      )}

      {defenseLogOpen && (
        <DefenseLogModal
          log={gameState.defenseLog}
          shieldUntil={gameState.shieldUntil}
          onClose={() => setDefenseLogOpen(false)}
          onWatchLive={() => { setDefenseLogOpen(false); startDefense(); }}
          onRevenge={handleRevenge}
          onWatchReplay={handleWatchReplay}
        />
      )}

      {isScoutingOpen && (() => {
        const academy = gameState.buildings.find(b => b.type === BuildingType.YOUTH_ACADEMY);
        if (!academy) return null;
        return (
          <ScoutingModal
            resources={gameState.resources}
            roster={gameState.roster}
            recruitSlot={gameState.recruitSlot}
            academy={academy}
            stadiumLevel={stadiumLevel}
            onClose={() => setIsScoutingOpen(false)}
            onStartRecruit={handleStartRecruit}
            onRush={handleRushRecruit}
            onSign={handleSignRecruit}
            onUpgrade={handleUpgradeBuilding}
          />
        );
      })()}

      {/* Live objective + readiness banner + arrow pointing at the next thing to tap */}
      {!frontOfficeOpen && <ObjectiveBanner gameState={gameState} onGoal={handleGoal} dailyClaimable={dailyClaimable} onOpenDailies={() => setIsDailyOpen(true)} />}
      <TourPointer
        gameState={gameState}
        active={!frontOfficeOpen && !(isSquadOpen || isScoutingOpen || isStandingsOpen || !!selectedBuilding || confirmingReset || showTutorial
          || defenseLogOpen || isHeroOpen || isDailyOpen || attackSelectOpen || settingsOpen || !!battleConfig)}
      />

      {/* 🏛 FRONT OFFICE — the whole defensive layer, managed from one list. Fixed
          formation (same field for every club); your edge is LEVELS, not layout. */}
      {frontOfficeOpen && (() => {
        const activeSlots = slotsFor(gameState.formation).filter(s => (gameState.defenseSlots[s.id] ?? 0) > 0).length;
        const walls = wallsFor(gameState.formation, stadiumLevel);
        const dr = computeDefenseRating(gameState.buildings, walls, gameState.roster, gameState.resources.FANS, activeSlots, gameState.parkingLot);
        const gradeColor = dr.score >= 70 ? '#22c55e' : dr.score >= 40 ? '#eab308' : '#ef4444';
        return (
          <Sheet
            title="Front Office"
            icon={<Shield className="text-sky-400" size={22} />}
            subtitle={<>Call your scheme, upgrade your emplacements — <b className="text-sky-300">levels and mastery</b> are your edge. See it fight with 🧪 Test.</>}
            onClose={() => setFrontOfficeOpen(false)}
            maxWidth="max-w-xl"
            footer={
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg border-2 shrink-0" style={{ borderColor: gradeColor }} title={dr.weakness}>
                  <span className="font-display font-black text-xl leading-none" style={{ color: gradeColor }}>{dr.grade}</span>
                  <span className="text-[11px] font-mono text-slate-300">{dr.score}</span>
                </div>
                <div className="text-[11px] text-slate-400 min-w-0 flex-1 truncate">{dr.weakness}</div>
                <Btn onClick={handleTestDefense} variant="secondary"><span>🧪</span> Test Defense</Btn>
              </div>
            }
          >
            <div className="p-4 sm:p-5 space-y-4">
              <HowTo id="frontoffice" lines={[
                'Pick a FORMATION (your defensive scheme), then level its emplacements — spots are fixed per scheme.',
                'Install and level emplacements with Coins. Higher Stadium levels unlock more slots.',
                'Walls and the Team Bus are automatic — they grow with your Stadium. No placing anything.',
                'Tap 🧪 Test Defense to watch your setup fight off a raid.',
              ]} />
              {/* 📋 FORMATION — call your defensive scheme. Free to switch; emplacement
                  levels carry over, only the geometry changes. Rivals see your scheme. */}
              <div>
                <div className="text-[12px] uppercase tracking-widest font-bold text-slate-400 mb-2">📋 Formation</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{/* phones: stack — 3-across clipped the third card */}
                  {FORMATION_ORDER.map(key => {
                    const fdef = formationDef(key);
                    const active = gameState.formation === key;
                    const unlocked = formationUnlocked(key, stadiumLevel);
                    const PLAN_NAME: Record<string, string> = { ground: 'Ground', air: 'Air Raid', balanced: 'Balanced' };
                    return (
                      <button key={key} onClick={() => handleSetFormation(key)} disabled={!unlocked}
                        className={`rounded-xl border-2 p-2.5 text-left transition-all active:scale-95 ${active ? 'border-sky-400 bg-sky-950/40' : unlocked ? 'border-slate-700 bg-slate-800/50 hover:border-slate-500' : 'border-slate-800 bg-slate-900/40 opacity-55 cursor-not-allowed'}`}>
                        <div className="text-[12px] font-display font-bold uppercase text-white leading-tight">{fdef.name}{active && <span className="ml-1 text-[9px] text-sky-300 align-middle">ACTIVE</span>}</div>
                        {(() => { const holds = gameState.formationMastery[key] ?? 0; const lvl = masteryLevel(holds); const next = nextMasteryAt(holds); return (
                          <div className="text-[10px] leading-none mt-1" title={`Formation mastery — hold your stadium (0 game balls allowed) while running this scheme. +3% defense per ★`}>
                            {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < lvl ? 1 : 0.25, filter: i < lvl ? 'none' : 'grayscale(1)' }}>⭐</span>)}
                            {lvl > 0 && <span className="ml-1 text-green-400 font-bold">+{lvl * 3}%</span>}
                            {next !== null && <span className="ml-1 text-slate-500 font-mono">{holds}/{next}</span>}
                          </div>
                        ); })()}
                        <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{unlocked ? fdef.motto : `🔒 Stadium L${fdef.unlockStadium}`}</div>
                        {unlocked && (
                          <div className="text-[9px] mt-1 leading-snug">
                            <span className="text-green-400">eats {fdef.counter.strongVs.map(k => PLAN_NAME[k]).join(' & ')}</span>
                            <span className="text-slate-600"> · </span>
                            <span className="text-red-400">soft vs {fdef.counter.weakTo.map(k => PLAN_NAME[k]).join(' & ')}</span>
                          </div>
                        )}
                        <FormationPreview f={key} />
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Emplacements */}
              <div>
                <div className="text-[12px] uppercase tracking-widest font-bold text-slate-400 mb-2">🛡 Defense Emplacements</div>
                <div className="space-y-1.5">
                  {slotsFor(gameState.formation).map(slot => {
                    const t = DEFENSE_TYPES.find(x => x.kind === slot.kind)!;
                    const lvl = gameState.defenseSlots[slot.id] ?? 0;
                    const unlocked = lvl > 0 || slotUnlocked(slot, stadiumLevel, gameState.bonusDefSlots); // installed = yours, even if gates later shift
                    const isCrown = slot.crownIndex !== undefined;
                    const maxed = lvl >= MAX_SLOT_LEVEL;
                    const gatedByStadium = !maxed && lvl + 1 > stadiumLevel;
                    const cost = slotUpgradeCost(slot.kind, lvl + 1);
                    const crownCost = isCrown ? EXTRA_SLOT_COSTS[slot.crownIndex!] : 0;
                    return (
                      <div key={slot.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${unlocked ? 'border-slate-700 bg-slate-800/50' : 'border-slate-800 bg-slate-900/40 opacity-60'}`}>
                        <span className="text-xl w-7 text-center shrink-0">{t.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">
                            {t.name} {lvl > 0 && <span className="text-yellow-300">L{lvl}</span>}
                            {lvl > 1 && <span className="text-[10px] text-green-400 font-mono ml-1.5">+{Math.round((slotHpMult(lvl) - 1) * 100)}% HP · +{Math.round((slotDmgMult(lvl) - 1) * 100)}% DMG</span>}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{slot.covers} · {t.desc}</div>
                        </div>
                        {!unlocked ? (
                          isCrown ? (
                            <Btn size="sm" variant="secondary" disabled={gameState.resources.GEMS < crownCost} onClick={handleBuySlot}
                              title="Crown slots unlock in order">🔓 {crownCost}👑</Btn>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-bold shrink-0">🔒 Stadium L{slot.stadiumReq}</span>
                          )
                        ) : maxed ? (
                          <span className="text-[11px] text-green-400 font-bold shrink-0">MAX</span>
                        ) : gatedByStadium ? (
                          <span className="text-[11px] text-slate-500 font-bold shrink-0" title="Emplacement level can't pass your Stadium level">🔒 Stadium L{lvl + 1}</span>
                        ) : (
                          <Btn size="sm" onClick={() => handleUpgradeSlot(slot.id)} disabled={gameState.resources.COINS < cost}>
                            {lvl === 0 ? 'Install' : `L${lvl + 1}`} · {cost >= 1000 ? `${(cost / 1000).toFixed(1)}k` : cost}🪙
                          </Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parking Lot */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2.5">
                <span className="text-xl w-7 text-center shrink-0">🅿️</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">Parking Lot {[1, 2, 3].map(l => <span key={l} className={`w-2 h-2 rounded-sm ${l <= gameState.parkingLot ? 'bg-orange-400' : 'bg-slate-700'}`} />)}</div>
                  <div className="text-[11px] text-slate-400">{gameState.parkingLot > 0 ? `+${Math.round(gameState.parkingLot * 5.5)}% longer approach under fire` : 'Raiders reach your buildings fast'}</div>
                </div>
                {gameState.parkingLot < PARKING_LOT.maxLevel ? (
                  <Btn size="sm" onClick={handlePaveParkingLot} disabled={gameState.resources.COINS < PARKING_LOT.costs[gameState.parkingLot]}>
                    Pave L{gameState.parkingLot + 1} · {(PARKING_LOT.costs[gameState.parkingLot] / 1000).toFixed(0)}k🪙
                  </Btn>
                ) : <span className="text-[11px] text-green-400 font-bold shrink-0">MAX</span>}
              </div>

              {/* ⭐ HERO GATES — who holds each gate when your stadium is stormed */}
              <div>
                <div className="text-[12px] uppercase tracking-widest font-bold text-slate-400 mb-2">⭐ Hero Gate Assignment</div>
                <div className="space-y-1.5">
                  {gatePostsFor(gameState.formation).map(post => {
                    const unlockedHeroes = gameState.heroes.filter(h => h.unlocked !== false);
                    const assignedKey = gameState.heroGates[post.id];
                    return (
                      <div key={post.id} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2">
                        <span className="text-[12px] font-bold text-white w-32 shrink-0 truncate">🚪 {post.label}</span>
                        <div className="flex gap-1.5 flex-wrap min-w-0">
                          {unlockedHeroes.map(h => {
                            const def = HERO_DEFS.find(d => d.key === h.key);
                            if (!def) return null;
                            const active = assignedKey === h.key;
                            return (
                              <button key={h.key} onClick={() => handleAssignHeroGate(post.id, h.key)} title={`${def.name} — Lv${h.level}`}
                                className={`w-9 h-9 rounded-full overflow-hidden relative flex items-center justify-center border-2 transition-all active:scale-90 ${active ? 'border-yellow-400 ring-2 ring-yellow-400/40' : 'border-slate-600 opacity-60 hover:opacity-100'}`}
                                style={{ background: `radial-gradient(circle at 50% 35%, ${def.color}cc, #0f172a 90%)` }}>
                                <span className="absolute text-sm">{def.emoji}</span>
                                <img src={def.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-cover" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[11px] text-slate-500">Unassigned gates auto-fill with your strongest heroes. One gate per hero.</div>
                </div>
              </div>

              {/* Perimeter + crowd — automatic layers, shown so the player knows they exist */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 space-y-1">
                <div className="text-[12px] text-slate-300"><b>🛑 Perimeter:</b> {walls.length} Blocking Sleds at {wallHpFor(stadiumLevel)} HP — grows automatically with your Stadium (L{stadiumLevel}).</div>
                <div className="text-[12px] text-slate-300">
                  <b>🔊 Home crowd:</b> {gameState.resources.FANS >= 300
                    ? <span className="text-rose-300">{gameState.resources.FANS.toLocaleString()} fans stall enemy drives ~{(0.8 + Math.min(1.7, gameState.resources.FANS / 1500)).toFixed(1)}s every 10s</span>
                    : <span className="text-slate-500">under 300 fans — too quiet to rattle raiders yet</span>}
                </div>
                <div className="text-[12px] text-slate-300"><b>🚌 Team Bus:</b> parked across the south gate — raiders go through it or around it.</div>
                <div className="text-[12px] text-slate-500">Your heroes and defensive-minded players guard the field when you're attacked — see them in ▶ replays and 🧪 Test.</div>
              </div>
            </div>
          </Sheet>
        );
      })()}

      {/* Daily Practice opens from the Goals panel — one "what do I do now" surface. */}
      {isDailyOpen && (
        <DailyQuestsModal dailies={gameState.dailies} onClaim={handleClaimDaily} onClose={() => setIsDailyOpen(false)} />
      )}

      {/* ⚙️ Settings — mute, backup, and the dangerous stuff safely behind one door.
          (Reset used to sit naked next to Mute: one mis-tap from disaster.) */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed top-2 right-2 z-40 text-slate-400 hover:text-white bg-black/30 p-1.5 rounded-lg transition-colors"
        title="Settings"
      >
        <span className="relative flex">
          <SettingsIcon size={16} />
          {!hasExported && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" title="Back up your club — your save only lives in this browser" />}
        </span>
      </button>

      {settingsOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSettingsOpen(false)}>
          <div className="bg-slate-900 w-full max-w-sm rounded-2xl border border-slate-700 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-display font-bold text-white uppercase">Settings</h3>
              <button onClick={() => setSettingsOpen(false)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div><div className="text-sm font-bold text-white">{gameState.teamName}</div><div className="text-[11px] text-slate-500">your club</div></div>
                <span className="text-2xl">🏈</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">Sound</div>
                <button onClick={() => setMuted(toggleMute())} className={`px-3 py-1.5 rounded-lg border text-sm font-bold flex items-center gap-2 transition-colors ${muted ? 'border-slate-700 text-slate-400' : 'border-orange-500 text-orange-300 bg-orange-900/20'}`}>
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}{muted ? 'Muted' : 'On'}
                </button>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <div className="text-sm text-slate-300 mb-0.5">Back up your club</div>
                <div className="text-[11px] text-slate-500 mb-2">Your save lives only in this browser. Export a file so clearing data can never cost you the club — PvP identity included.</div>
                <div className="flex gap-2">
                  <button onClick={exportSave} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors active:scale-95">💾 Export</button>
                  <label className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold text-center cursor-pointer transition-colors active:scale-95">
                    📂 Import
                    <input type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
                  </label>
                </div>
                {importPending && (
                  <div className="mt-3 rounded-xl border border-yellow-700 bg-yellow-950/40 p-3">
                    <div className="text-[12px] text-yellow-200 font-bold mb-2">Replace your current club with this backup? Your current progress here will be overwritten.</div>
                    <div className="flex gap-2">
                      <button onClick={() => setImportPending(null)} className="flex-1 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancel</button>
                      <button onClick={applyImport} className="flex-1 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold">Import & reload</button>
                    </div>
                  </div>
                )}
              </div>
              {/* ☁️ PROFILE & CLOUD SAVE — anonymous-first: linking an email upgrades
                  this device's identity in place (club, base, and raid history keep) */}
              {pvpEnabled() && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-sm text-slate-300 mb-0.5">Profile & cloud save</div>
                  {profile?.email || profile?.pendingEmail ? (
                    <>
                      <div className="text-[11px] text-slate-500 mb-2">
                        {profile.email
                          ? <>Signed in as <span className="text-slate-300 font-bold">{profile.email}</span>. Your club syncs automatically.</>
                          : <>Almost done — we sent a confirmation link to <span className="text-yellow-300 font-bold">{profile.pendingEmail}</span>. Your club already syncs from THIS device; click the link to unlock sign-in from other devices, then tap Sync now.</>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={async () => { setCloudMsg('Syncing…'); const r = await syncWithCloud(); setCloudMsg(r === 'pushed' ? 'Club saved to the cloud ✓' : r === 'none' ? 'Could not reach the cloud — will retry' : null); }}
                          className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors active:scale-95">☁️ Sync now</button>
                        <button onClick={() => { signOutToGuest(); setProfile(null); setCloudMsg('Signed out — this device plays as a new guest.'); }}
                          className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold transition-colors active:scale-95">Sign out</button>
                      </div>
                      <button onClick={async () => {
                        if (cloudMsg !== 'Delete cloud data? Tap again to confirm.') { setCloudMsg('Delete cloud data? Tap again to confirm.'); return; }
                        const ok = await deleteCloudData();
                        setCloudMsg(ok ? 'Cloud save and published base deleted. Local club untouched.' : 'Delete failed — try again.');
                      }} className="mt-2 w-full py-1.5 rounded-lg border border-red-900 text-red-400 hover:bg-red-950/50 text-[12px] font-bold transition-colors">Delete my cloud data…</button>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-slate-500 mb-2">Create a free account to play this club on any device. Everything carries over — base, trophies, raid history.</div>
                      <input id="fhq-auth-email" type="email" placeholder="Email" autoComplete="email"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 mb-2" style={{ fontSize: 16 }} />
                      <input id="fhq-auth-pass" type="password" placeholder="Password (8+ characters)" autoComplete="new-password"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 mb-2" style={{ fontSize: 16 }} />
                      <div className="flex gap-2">
                        <button onClick={async () => {
                          const email = (document.getElementById('fhq-auth-email') as HTMLInputElement | null)?.value.trim() ?? '';
                          const pass = (document.getElementById('fhq-auth-pass') as HTMLInputElement | null)?.value ?? '';
                          if (!email.includes('@') || pass.length < 8) { setCloudMsg('Enter a valid email and an 8+ character password.'); return; }
                          setCloudMsg('Creating your account…');
                          const r = await linkAccount(email, pass);
                          if (!r.ok) { setCloudMsg(r.error ?? 'Could not create the account.'); return; }
                          const p = await getProfile(); setProfile(p);
                          const pushed = await pushSaveToCloud();
                          setCloudMsg(p?.email
                            ? (pushed ? 'Account created — club saved to the cloud ✓' : 'Account created ✓ — cloud sync will start on the next connection.')
                            : `Account created — confirm via the link we emailed to ${p?.pendingEmail ?? email} to enable sign-in on other devices.`);
                        }} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors active:scale-95">Create account</button>
                        <button onClick={async () => {
                          const email = (document.getElementById('fhq-auth-email') as HTMLInputElement | null)?.value.trim() ?? '';
                          const pass = (document.getElementById('fhq-auth-pass') as HTMLInputElement | null)?.value ?? '';
                          if (!email.includes('@') || !pass) { setCloudMsg('Enter your email and password.'); return; }
                          setCloudMsg('Signing in…');
                          const r = await signInWithPassword(email, pass);
                          if (!r.ok) { setCloudMsg(r.error ?? 'Sign-in failed.'); return; }
                          const p = await getProfile(); setProfile(p);
                          setCloudMsg('Signed in — loading your club…');
                          await syncWithCloud(true); // fresh device: the cloud club wins (local backed up first)
                        }} className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold transition-colors active:scale-95">Sign in</button>
                      </div>
                    </>
                  )}
                  {cloudMsg && <div className="mt-2 text-[11px] text-slate-400">{cloudMsg}</div>}
                </div>
              )}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <div className="text-sm text-slate-400">Start a brand-new franchise</div>
                {/* build-stamp sits with reset — see note below the button */}
                <button onClick={() => { setSettingsOpen(false); setConfirmingReset(true); }} className="px-3 py-1.5 rounded-lg border border-red-900 text-red-400 hover:bg-red-950/50 text-sm font-bold transition-colors">Reset…</button>
              </div>
              {/* Which build am I on? Baked at deploy time — if this timestamp is old, Safari is serving cache. */}
              <div className="text-center text-[10px] text-slate-600 font-mono">build {typeof __BUILD_TS__ !== 'undefined' ? __BUILD_TS__ : 'dev'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation (in-game, no native dialog) */}
      {confirmingReset && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 w-full max-w-xs rounded-2xl border border-slate-700 shadow-2xl p-6 text-center">
            <h3 className="text-xl font-display font-bold text-white mb-2">Reset Franchise?</h3>
            <p className="text-slate-400 text-sm mb-6">This wipes all progress and starts a brand-new franchise. This can’t be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmingReset(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors">Cancel</button>
              <button onClick={handleResetGame} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-colors">Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav — club chrome: charcoal surface, orange = active (D2 identity) */}
      <div className="fixed bottom-0 left-0 w-full bg-[#0b0f1a]/95 backdrop-blur border-t border-[#1f2937] pb-safe pt-2 px-4 z-40">
        <div className="flex justify-between items-center gap-1 max-w-md mx-auto px-1 pb-4">
          <NavBtn icon={<Users />} label="Coach" active={isSquadOpen} onClick={() => setIsSquadOpen(true)} tourId="coach" />

          <NavBtn icon={<Star />} label="Heroes" active={isHeroOpen} onClick={() => setIsHeroOpen(true)} />

          <div
             data-tour="trophy"
             onClick={openRaid}
             className="relative -mt-10 p-4 sm:p-5 rounded-full border-4 shadow-2xl cursor-pointer hover:scale-105 transition-transform bg-red-600 border-red-400 hover:bg-red-500 shrink-0"
          >
             <Swords size={30} className="text-white" />
             {unseenDefenses > 0 && (
               <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-sky-500 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center leading-none animate-pulse">{unseenDefenses}</span>
             )}
          </div>

          <NavBtn icon={<Calendar />} label="Ranks" onClick={() => setIsStandingsOpen(true)} />

          <NavBtn icon={<Shield />} label="Defense" active={frontOfficeOpen} tourId="design" onClick={() => { setFrontOfficeOpen(true); setSelectedBuilding(null); }} />
        </div>
      </div>
    </div>
  );
}

const NavBtn = ({ icon, label, active, onClick, tourId, badge }: any) => (
  <button data-tour={tourId} onClick={onClick} className={`relative flex flex-col items-center gap-1 transition-all active:scale-90 ${active ? 'text-orange-400' : 'text-slate-500 hover:text-slate-200'}`}>
    {icon}
    <span className="text-[12px] uppercase font-bold leading-none">{label}</span>
    {active && <span className="absolute -bottom-2 w-6 h-0.5 rounded-full bg-orange-500" />}
    {badge > 0 && (
      <span className="absolute -top-1.5 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 border-2 border-slate-900 text-[10px] font-bold text-white flex items-center justify-center leading-none">{badge}</span>
    )}
  </button>
);

export default App;
