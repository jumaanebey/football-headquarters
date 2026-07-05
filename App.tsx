
import React, { useState, useEffect, useRef } from 'react';
import { GameState, ResourceType, BuildingInstance, BuildingType, DrillState, FloatingText, PlayerState, BonusOrb, SeasonPhase, UnitGroup, MatchResult, Player, UpgradeJob, DefenseLogEntry } from './types';
import { INITIAL_BUILDINGS, DRILLS, INITIAL_ROSTER, VOXEL_CONFIG, RECRUIT_CONFIG, COLLECTOR_CONFIG, collectorRate, collectorCap, RALLY_CONFIG, INITIAL_WALLS, WALL_CAP, INITIAL_BUILDERS, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, energyIntervalMs, trainingXpMult, warRoomReadinessMult, OPPONENTS, SHIELD_HOURS, DEFENSE_TYPES, maxDefenses, RAID_ENERGY, PARKING_LOT, wallCap, buildingTiles, inFootprint, EXTRA_SLOT_COSTS } from './constants';
import { rosterCap, recruitSeconds } from './recruiting';
import { sfx, toggleMute, isMuted } from './sound';
import { IsometricMap, screenToTile, BOARD_DIMS } from './components/IsometricMap';
import { TopHUD } from './components/TopHUD';
import { SquadModal } from './components/SquadModal';
import { ActionModal } from './components/ActionModal';
import { ScoutingModal } from './components/ScoutingModal';
import { StandingsModal } from './components/StandingsModal';
import { TutorialOverlay } from './components/TutorialOverlay';
import { ObjectiveBanner } from './components/ObjectiveBanner';
import { TourPointer } from './components/TourPointer';
import { GoalId } from './objectives';
import { computeDefenseRating, defenseTroopBoost } from './defense';
import { tendencyFromId, TENDENCIES, TendencyKey } from './constants';
import { generateRaidTargets, EnemyBase } from './battle';
import { rankFor, trophiesForRaid, trophiesLostOnDefense } from './ranks';
import { rollHero, RollResult, ROLL_COST_GEMS, STAR_UP_COSTS, MAX_STARS } from './gacha';
import { CAMPAIGN_STAGES, campaignBase, coachForStage, coachForBase } from './campaign';
import { ALL_QUESTS, questsForDate, freshDailies, todayKey, SWEEP_BONUS_GEMS } from './dailies';
import { pvpEnabled, publishBase, findOpponents, reportAttack, fetchAttacksOnMe, fetchBase, LiveBase } from './pvp';
import { DailyQuestsModal } from './components/DailyQuestsModal';
import { RECRUIT_LAST_NAMES } from './constants';

const TEAM_SUFFIXES = ['Dynasty', 'United', 'Stampede', 'Storm', 'Legion', 'Express'];
const genTeamName = () => `${RECRUIT_LAST_NAMES[Math.floor(Math.random() * RECRUIT_LAST_NAMES.length)]} ${TEAM_SUFFIXES[Math.floor(Math.random() * TEAM_SUFFIXES.length)]}`;
import { BattleScreen, BattleResult, BattleConfig } from './components/BattleScreen';
import { ENEMY_BASES, armyFromRoster, armyStrength, heroesForBattle, HERO_DEFS, heroUpgradeCost, heroMaxLevel, defenseLayoutFromBase, defenseAiTroops, specialsForBattle, simulateRaid, raidAiMult, makeRevengeBase, homeDefenders } from './battle';
import { HeroModal } from './components/HeroModal';
import { DefenseLogModal } from './components/DefenseLogModal';
import { FloatingTextLayer } from './components/FloatingTextLayer';
import { Trophy, Users, Calendar, Volume2, VolumeX, Swords, X, Shield, Star, ClipboardList, Settings as SettingsIcon } from 'lucide-react';

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
  buildings: INITIAL_BUILDINGS,
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
  bus: { gridX: 6, gridY: 9 }, // the Team Bus — a movable big blocker (was static decor)
  parkingLot: 0,
  bonusDefSlots: 0
};

const SAVE_KEY = 'fhq_save_v1';
const TUTORIAL_KEY = 'fhq_tutorial_done_v1';

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

      // --- 2×2 FOOTPRINT MIGRATION (idempotent) ---
      // Facilities occupy 4 tiles now. De-overlap buildings (Stadium keeps its spot first),
      // then free any walls/equipment/bus trapped inside a footprint into the inventory.
      {
        const occ = new Set<string>();
        const fits = (gx: number, gy: number) =>
          gx >= 0 && gx <= 8 && gy >= 0 && gy <= 8 && !buildingTiles(gx, gy).some(([x, y]) => occ.has(`${x},${y}`));
        const order = [...buildings].sort((a, b) => (a.type === BuildingType.STADIUM ? -1 : b.type === BuildingType.STADIUM ? 1 : 0));
        for (const b of order) {
          let gx = Math.min(8, Math.max(0, b.gridX));
          let gy = Math.min(8, Math.max(0, b.gridY));
          if (!fits(gx, gy)) {
            // spiral out to the nearest anchor that fits
            outer: for (let rad = 1; rad <= 9; rad++) {
              for (let dx = -rad; dx <= rad; dx++) for (let dy = -rad; dy <= rad; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
                if (fits(gx + dx, gy + dy)) { gx += dx; gy += dy; break outer; }
              }
            }
          }
          b.gridX = gx; b.gridY = gy;
          buildingTiles(gx, gy).forEach(([x, y]) => occ.add(`${x},${y}`));
        }
        // Free trapped pieces → inventory (never delete what the player owns).
        const trappedWalls = (saved.walls || INITIAL_WALLS).filter((w: { gridX: number; gridY: number }) => occ.has(`${w.gridX},${w.gridY}`)).length;
        if (trappedWalls > 0) inventory.sleds += trappedWalls;
        var migratedWalls = (saved.walls || INITIAL_WALLS).filter((w: { gridX: number; gridY: number }) => !occ.has(`${w.gridX},${w.gridY}`));
        for (const d of [...defenses]) {
          if (occ.has(`${d.gridX},${d.gridY}`)) {
            inventory.defenses.push({ kind: d.kind });
            defenses.splice(defenses.indexOf(d), 1);
          }
        }
        if (bus && occ.has(`${bus.gridX},${bus.gridY}`)) { inventory.bus = true; bus = null; }
      }
      // "While you were away" — resolve rival raids against your ACTUAL base for the
      // offline stretch. Base design (levels + Blocking Sleds) changes how they do.
      let defenseLog = [...(saved.defenseLog || [])];
      let coins = saved.resources?.[ResourceType.COINS] ?? INITIAL_STATE.resources[ResourceType.COINS];
      let shieldUntil = saved.shieldUntil || 0;
      let trophies = saved.trophies || 0;
      // A protective shield (earned after a beating) blocks all offline raids until it expires.
      const shielded = now < shieldUntil;
      const numAttacks = (shielded || offlineSecs < 1200) ? 0 : Math.min(3, 1 + Math.floor(offlineSecs / 3600)); // 20min→1, 1h→2, 2h+→3
      if (numAttacks > 0) {
        const stadiumLvl = buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
        const layout = defenseLayoutFromBase(buildings, migratedWalls, defenseTroopBoost(roster), defenses, bus, parkingLot);
        let worstPct = 0;
        for (let a = 0; a < numAttacks; a++) {
          const opp = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
          const res = simulateRaid(layout, defenseAiTroops(), raidAiMult(opp.offenseRating, stadiumLvl));
          const coinsLost = Math.min(coins, Math.round(coins * 0.12 * (res.pct / 100)));
          coins -= coinsLost;
          trophies = Math.max(0, trophies + trophiesLostOnDefense(res.pct)); // storming your stadium costs you rank
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
      return { ...INITIAL_STATE, ...saved, buildings, roster, heroes, campaign, dailies, teamName, defenses, inventory, bus, parkingLot, bonusDefSlots, walls: migratedWalls, resources, defenseLog, shieldUntil, trophies, lastTick: now };
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
  const [attackSelectOpen, setAttackSelectOpen] = useState(false);
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingInstance | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [muted, setMuted] = useState(isMuted());
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [moveSel, setMoveSel] = useState<string | null>(null);
  const [isHeroOpen, setIsHeroOpen] = useState(false);
  const [defenseLogOpen, setDefenseLogOpen] = useState(false);
  const [raidTargets, setRaidTargets] = useState<EnemyBase[]>([]);
  const [attackTab, setAttackTab] = useState<'season' | 'raid'>('season');
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [liveTargets, setLiveTargets] = useState<LiveBase[]>([]);
  const [placingDefense, setPlacingDefense] = useState<string | null>(null); // DEFENSE_TYPES kind being placed (shop buy)
  const [placingInv, setPlacingInv] = useState<{ type: 'sled' | 'bus' | 'defense'; kind?: string } | null>(null); // inventory piece being placed back
  const [designExpanded, setDesignExpanded] = useState(false); // Chalkboard HUD starts slim so the board (and funnel lanes) stay visible
  const [chalkIntro, setChalkIntro] = useState(() => { try { return localStorage.getItem('fhq_chalk_intro_v1') !== '1'; } catch { return true; } });
  const dismissChalkIntro = () => { setChalkIntro(false); try { localStorage.setItem('fhq_chalk_intro_v1', '1'); } catch { /* ignore */ } };

  // 🫳 CARRY: real drag-and-drop from the HUD (inventory chips + shop) onto the board.
  // Pointer down on a chip picks the piece up; it rides the cursor; release on a green
  // tile places it. A plain tap (no movement) still arms the tap-to-place flow.
  const [carry, setCarry] = useState<{ source: 'sled' | 'bus' | 'defense' | 'shop'; kind?: string; sprite: string } | null>(null);
  const [carryPos, setCarryPos] = useState({ x: 0, y: 0 });
  const [carryGhost, setCarryGhost] = useState<{ gx: number; gy: number; ok: boolean } | null>(null);
  const carryGhostRef = useRef<{ gx: number; gy: number; ok: boolean } | null>(null);
  const carryMovedRef = useRef(false);
  const carryStartRef = useRef({ x: 0, y: 0 });
  const startCarry = (e: React.PointerEvent, source: 'sled' | 'bus' | 'defense' | 'shop', kind: string | undefined, sprite: string) => {
    e.preventDefault();
    carryStartRef.current = { x: e.clientX, y: e.clientY };
    carryMovedRef.current = false;
    carryGhostRef.current = null;
    setCarryPos({ x: e.clientX, y: e.clientY });
    setCarry({ source, kind, sprite });
  };
  useEffect(() => {
    if (!carry) return;
    const move = (e: PointerEvent) => {
      setCarryPos({ x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - carryStartRef.current.x, e.clientY - carryStartRef.current.y) > 7) carryMovedRef.current = true;
      const el = document.querySelector('[data-fhq-board]') as HTMLElement | null;
      if (!el) { carryGhostRef.current = null; setCarryGhost(null); return; }
      const r = el.getBoundingClientRect();
      const bx = (e.clientX - r.left) * BOARD_DIMS.w / r.width;
      const by = (e.clientY - r.top) * BOARD_DIMS.h / r.height;
      const { gx, gy } = screenToTile(bx, by);
      if (gx < 0 || gx > 9 || gy < 0 || gy > 9) { carryGhostRef.current = null; setCarryGhost(null); return; }
      const g = stateRef.current;
      const free = !g.buildings.some(b => inFootprint(gx, gy, b.gridX, b.gridY))
        && !g.walls.some(w => w.gridX === gx && w.gridY === gy)
        && !g.defenses.some(d => d.gridX === gx && d.gridY === gy)
        && !(g.bus && g.bus.gridX === gx && g.bus.gridY === gy);
      const lvl = g.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
      const cap = maxDefenses(lvl) + g.bonusDefSlots;
      const ok = free && (
        carry.source === 'sled' ? (g.inventory.sleds > 0 && g.walls.length < wallCap(lvl))
        : carry.source === 'bus' ? g.inventory.bus
        : carry.source === 'defense' ? (g.inventory.defenses.some(d => d.kind === carry.kind) && g.defenses.length < cap)
        : (g.resources.COINS >= (DEFENSE_TYPES.find(t => t.kind === carry.kind)?.cost ?? Infinity) && g.defenses.length < cap)
      );
      carryGhostRef.current = { gx, gy, ok };
      setCarryGhost(carryGhostRef.current);
    };
    const up = () => {
      const ghost = carryGhostRef.current;
      const moved = carryMovedRef.current;
      const c = carry;
      setCarry(null); setCarryGhost(null); carryGhostRef.current = null;
      if (!moved) {
        // tap → arm/toggle the classic tap-to-place flow
        if (c.source === 'shop') { setPlacingDefense(p => p === c.kind ? null : c.kind!); setPlacingInv(null); }
        else { setPlacingInv(p => (p && p.type === c.source && p.kind === c.kind) ? null : { type: c.source, kind: c.kind }); setPlacingDefense(null); }
        return;
      }
      if (ghost?.ok) {
        if (c.source === 'shop') buyAndPlaceDefense(c.kind!, ghost.gx, ghost.gy);
        else placeInvPiece(c.source, c.kind, ghost.gx, ghost.gy);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [carry]); // eslint-disable-line react-hooks/exhaustive-deps
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
        if (v != null) localStorage.setItem(k, v); else localStorage.removeItem(k);
      }
    });
    location.reload();
  };

  const finishTutorial = (teamName: string, startRaid: boolean) => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    setShowTutorial(false);
    setGameState(prev => ({ ...prev, teamName }));
    if (pvpEnabled()) setTimeout(() => publishBase(teamName, gameState.trophies, defenseLayoutFromBase(gameState.buildings, gameState.walls, defenseTroopBoost(gameState.roster), gameState.defenses, gameState.bus, gameState.parkingLot)), 400);
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
      else if (selectedBuilding) setSelectedBuilding(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importPending, settingsOpen, confirmingReset, isDailyOpen, defenseLogOpen, isHeroOpen, isStandingsOpen, isScoutingOpen, isSquadOpen, attackSelectOpen, selectedBuilding]);

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
    };
    const saveLoop = setInterval(persist, 2000);
    window.addEventListener('beforeunload', persist);
    return () => {
      clearInterval(saveLoop);
      window.removeEventListener('beforeunload', persist);
      persist();
    };
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
        const stadiumB = prev.buildings.find(b => b.type === BuildingType.STADIUM);
        const patrolPoint = () => {
          const cx = (stadiumB?.gridX ?? 6) * 10 + 5, cy = (stadiumB?.gridY ?? 6) * 10 + 5; // 2×2 footprint center
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
            if (job.kind === 'building') finalBuildings = finalBuildings.map(b => b.id === job.key ? { ...b, level: job.toLevel } : b);
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
      const pitchTargetX = freePitch.gridX * 10 + 10; // center of the 2×2 practice field
      const pitchTargetY = freePitch.gridY * 10 + 10;

      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.ENERGY]: prev.resources.ENERGY - drill.costEnergy },
        buildings: prev.buildings.map(b =>
          b.id === freePitch.id
          ? { ...b, state: DrillState.ACTIVE, activeDrillId: drillId, targetUnit: unit, startTime: Date.now(), finishTime: Date.now() + (drill.durationSeconds * 1000) }
          : b
        ),
        roster: prev.roster.map(p => {
          if (p.unit === unit) {
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
           if (p.unit === building.targetUnit) {
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
      case 'fortify': setEditMode(true); setMoveSel(null); setSelectedBuilding(null); break;
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
      loot: { coins: Math.round(entry.coinsLost * 1.5) + 200, fans: 25 }, // reclaim more than they took
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
    setBattleConfig(config);
    return true;
  };

  const startDefense = () => {
    const coinsAtRisk = Math.min(gameState.resources.COINS, Math.round(gameState.resources.COINS * 0.15) + 120);
    const stadiumLvl = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
    setBattleConfig({
      mode: 'defense',
      title: 'Defend Your Stadium',
      buildings: defenseLayoutFromBase(gameState.buildings, gameState.walls, defenseTroopBoost(gameState.roster), gameState.defenses, gameState.bus, gameState.parkingLot),
      preTroops: defenseAiTroops(),
      aiMult: raidAiMult(65, stadiumLvl), // mid-tier live raider; same tuned curve as offline
      homeGuards: homeDefenders(gameState.roster), // your recruited defenders, on the field
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
      if (r.coins > 0) spawnText(`+${r.coins} Coins looted!`, window.innerWidth / 2, window.innerHeight / 2, '#fbbf24');
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
      if (r.coins > 0) spawnText(`−${r.coins} Coins raided!`, window.innerWidth / 2, window.innerHeight / 2, '#ef4444');
      else spawnText('Base defended!', window.innerWidth / 2, window.innerHeight / 2, '#10b981');
    }
    if (r.won) sfx.victory(); else sfx.defeat();
    setBattleConfig(null);
  };

  // Heroes level INSTANTLY on coins (their own track — not gated by builders/timers),
  // so the game stays hero-focused and leveling feels rewarding.
  const handleUpgradeHero = (key: string, cost: number) => {
    setGameState(prev => {
      const hero = prev.heroes.find(h => h.key === key);
      if (!hero || !hero.unlocked) return prev;
      const stadiumLvl = prev.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
      if (hero.level >= heroMaxLevel(stadiumLvl)) { sfx.error(); return prev; }
      if (prev.resources.COINS < cost) { sfx.error(); return prev; }
      return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost }, heroes: prev.heroes.map(h => h.key === key ? { ...h, level: h.level + 1 } : h) };
    });
    // Mirror the success guards for the daily-quest bump (state update above is functional).
    const h0 = gameState.heroes.find(h => h.key === key);
    const stadLvl0 = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
    if (h0?.unlocked && h0.level < heroMaxLevel(stadLvl0) && gameState.resources.COINS >= cost) bumpDaily('train_hero');
    sfx.upgrade();
    spawnText('Hero leveled up!', window.innerWidth / 2, window.innerHeight / 2, '#facc15');
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
        return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: coins }, trophies, defenseLog: [...entries.reverse(), ...prev.defenseLog].slice(0, 20) };
      });
    });
  }, []);

  // Publish my base snapshot so rivals can raid it (on load; also after each battle below).
  const publishMyBase = () => {
    if (!pvpEnabled()) return;
    publishBase(gameState.teamName, gameState.trophies, defenseLayoutFromBase(gameState.buildings, gameState.walls, defenseTroopBoost(gameState.roster), gameState.defenses, gameState.bus, gameState.parkingLot));
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

  // --- BASE DESIGN (edit mode): place/remove walls, buy+place defenses, move pieces ---
  const tileFree = (gx: number, gy: number, ignoreId?: string) =>
    gx >= 0 && gx < 10 && gy >= 0 && gy < 10
    && !gameState.buildings.some(b => b.id !== ignoreId && inFootprint(gx, gy, b.gridX, b.gridY))
    && !gameState.walls.some(w => w.gridX === gx && w.gridY === gy)
    && !gameState.defenses.some(d => d.id !== ignoreId && d.gridX === gx && d.gridY === gy)
    && !(gameState.bus && ignoreId !== 'team-bus' && gameState.bus.gridX === gx && gameState.bus.gridY === gy);

  // A 2×2 building can sit at (gx,gy) when all four tiles are clear of everything else.
  const canPlaceBuilding = (id: string, gx: number, gy: number) =>
    gx >= 0 && gx <= 8 && gy >= 0 && gy <= 8
    && buildingTiles(gx, gy).every(([x, y]) => tileFree(x, y, id));

  // Equipment capacity = Stadium-granted slots + purchased bonus slots.
  const defenseCap = () => maxDefenses(stadiumLevel) + gameState.bonusDefSlots;
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

  // ↩️ UNDO (Chalkboard): snapshot every board-mutating action. Coins/parking are included
  // so undoing a purchase refunds it — the snapshot is always internally consistent.
  const undoStack = useRef<Array<{ walls: GameState['walls']; defenses: GameState['defenses']; bus: GameState['bus']; inventory: GameState['inventory']; parkingLot: number; coins: number; buildingPos: { id: string; gridX: number; gridY: number }[] }>>([]);
  const pushUndo = () => {
    const g = stateRef.current;
    undoStack.current.push({
      walls: g.walls, defenses: g.defenses, bus: g.bus, inventory: g.inventory, parkingLot: g.parkingLot, coins: g.resources.COINS,
      buildingPos: g.buildings.map(b => ({ id: b.id, gridX: b.gridX, gridY: b.gridY })), // positions only — never revert a level-up
    });
    if (undoStack.current.length > 30) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
  };
  const [undoCount, setUndoCount] = useState(0);
  const handleUndo = () => {
    const snap = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!snap) return;
    setGameState(prev => ({
      ...prev,
      walls: snap.walls, defenses: snap.defenses, bus: snap.bus, inventory: snap.inventory, parkingLot: snap.parkingLot,
      resources: { ...prev.resources, [ResourceType.COINS]: snap.coins },
      buildings: prev.buildings.map(b => { const p = snap.buildingPos.find(x => x.id === b.id); return p ? { ...b, gridX: p.gridX, gridY: p.gridY } : b; }),
    }));
    sfx.click();
  };
  const clearUndo = () => { undoStack.current = []; setUndoCount(0); };

  // 🖌 PAINT SLEDS: drag across empty grass to lay a wall line in one stroke.
  const handlePaintWall = (gx: number, gy: number) => {
    if (!tileFree(gx, gy)) return;
    setGameState(prev => {
      const cap = wallCap(prev.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1);
      if (prev.walls.length >= cap) return prev;
      if (prev.walls.some(w => w.gridX === gx && w.gridY === gy)) return prev;
      return { ...prev, walls: [...prev.walls, { gridX: gx, gridY: gy }] };
    });
  };

  // 🧪 TEST DEFENSE: run a scrimmage against the layout you're literally looking at.
  const handleTestDefense = () => {
    setEditMode(false); setMoveSel(null); setPlacingDefense(null); setPlacingInv(null); setDesignExpanded(false);
    startDefense();
  };

  // 📦 STORE ALL: sweep every movable piece (sleds, equipment, the bus) into inventory
  // so you can redesign from a clean board and place them back one by one.
  const handleStoreAll = () => {
    pushUndo();
    setGameState(prev => ({
      ...prev,
      walls: [],
      defenses: [],
      bus: null,
      inventory: {
        sleds: prev.inventory.sleds + prev.walls.length,
        defenses: [...prev.inventory.defenses, ...prev.defenses.map(d => ({ kind: d.kind }))],
        bus: prev.inventory.bus || !!prev.bus,
      },
    }));
    setPlacingDefense(null);
    setPlacingInv(null);
    sfx.click();
    spawnText('Board cleared — pieces stored 📦', window.innerWidth / 2, window.innerHeight / 2, '#60a5fa');
  };

  // CORE inventory placement — used by tap-to-place AND chip→board drag-drop.
  const placeInvPiece = (type: 'sled' | 'bus' | 'defense', kind: string | undefined, gx: number, gy: number): boolean => {
    if (!tileFree(gx, gy)) { sfx.error(); return false; }
    if (type === 'sled') {
      if (gameState.inventory.sleds <= 0) return false;
      if (gameState.walls.length >= wallCap(stadiumLevel)) { spawnText('Wall limit reached — upgrade your Stadium for more', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return false; }
      pushUndo();
      setGameState(prev => ({
        ...prev,
        walls: [...prev.walls, { gridX: gx, gridY: gy }],
        inventory: { ...prev.inventory, sleds: prev.inventory.sleds - 1 },
      }));
    } else if (type === 'bus') {
      if (!gameState.inventory.bus) return false;
      pushUndo();
      setGameState(prev => ({ ...prev, bus: { gridX: gx, gridY: gy }, inventory: { ...prev.inventory, bus: false } }));
    } else {
      if (!kind || !gameState.inventory.defenses.some(d => d.kind === kind)) return false;
      if (gameState.defenses.length >= defenseCap()) { spawnText('Slot limit — buy a slot or upgrade your Stadium', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return false; }
      pushUndo();
      setGameState(prev => {
        const idx = prev.inventory.defenses.findIndex(d => d.kind === kind);
        if (idx < 0) return prev;
        return {
          ...prev,
          defenses: [...prev.defenses, { id: `def_${Date.now()}`, kind, gridX: gx, gridY: gy }],
          inventory: { ...prev.inventory, defenses: prev.inventory.defenses.filter((_, i) => i !== idx) },
        };
      });
    }
    sfx.upgrade();
    return true;
  };

  // Tap-armed flow (chip tapped, then a tile tapped) — wraps the core + manages arming.
  const handlePlaceFromInventory = (gx: number, gy: number): boolean => {
    if (!placingInv) return false;
    const placed = placeInvPiece(placingInv.type, placingInv.kind, gx, gy);
    if (!placed) return true; // consumed the tap; feedback already shown
    if (placingInv.type === 'sled') { if (gameState.inventory.sleds <= 1) setPlacingInv(null); }
    else if (placingInv.type === 'bus') setPlacingInv(null);
    else if (gameState.inventory.defenses.filter(d => d.kind === placingInv.kind).length <= 1) setPlacingInv(null);
    return true;
  };

  // Tap a piece in Chalkboard mode → rotate it (mirror flip). Buildings select-to-move instead.
  const handleFlipDefense = (id: string) => {
    pushUndo();
    setGameState(prev => ({ ...prev, defenses: prev.defenses.map(d => d.id === id ? { ...d, flip: !d.flip } : d) }));
  };
  const handleFlipBus = () => {
    pushUndo();
    setGameState(prev => prev.bus ? { ...prev, bus: { ...prev.bus, flip: !prev.bus.flip } } : prev);
  };
  // 🅿️ Pave the next Parking Lot level — territory that stretches the raiders' approach.
  const handlePaveParkingLot = () => {
    pushUndo();
    setGameState(prev => {
      if (prev.parkingLot >= PARKING_LOT.maxLevel) return prev;
      const cost = PARKING_LOT.costs[prev.parkingLot];
      if (prev.resources.COINS < cost) { sfx.error(); return prev; }
      return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost }, parkingLot: prev.parkingLot + 1 };
    });
    const affordable = gameState.parkingLot < PARKING_LOT.maxLevel && gameState.resources.COINS >= PARKING_LOT.costs[gameState.parkingLot];
    if (affordable) { sfx.upgrade(); spawnText('🅿️ Parking Lot paved — longer approach for raiders!', window.innerWidth / 2, window.innerHeight / 2, '#4ade80'); setTimeout(publishMyBase, 500); }
  };

  const handleMoveBus = (gx: number, gy: number) => {
    if (!tileFree(gx, gy, 'team-bus')) { sfx.error(); return; }
    pushUndo();
    setGameState(prev => prev.bus ? { ...prev, bus: { ...prev.bus, gridX: gx, gridY: gy } } : prev);
    sfx.click();
  };

  // CORE shop buy+place — used by tap-to-place AND shop→board drag-drop.
  const buyAndPlaceDefense = (kind: string, gx: number, gy: number): boolean => {
    const t = DEFENSE_TYPES.find(x => x.kind === kind);
    if (!t) return false;
    if (!tileFree(gx, gy)) { sfx.error(); return false; }
    if (gameState.defenses.length >= defenseCap()) { spawnText('Slot limit — buy a slot or upgrade your Stadium', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return false; }
    if (gameState.resources.COINS < t.cost) { sfx.error(); spawnText('Need coins', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return false; }
    pushUndo();
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - t.cost },
      defenses: [...prev.defenses, { id: `def_${Date.now()}`, kind: t.kind, gridX: gx, gridY: gy }],
    }));
    sfx.upgrade();
    spawnText(`${t.name} installed!`, window.innerWidth / 2, window.innerHeight / 2, '#4ade80');
    return true;
  };

  const handlePlaceDefense = (gx: number, gy: number) => {
    if (!placingDefense) return false;
    if (buyAndPlaceDefense(placingDefense, gx, gy)) setPlacingDefense(null);
    return true;
  };

  const handleMoveDefense = (id: string, gx: number, gy: number) => {
    if (!tileFree(gx, gy, id)) { sfx.error(); return; }
    pushUndo();
    setGameState(prev => ({ ...prev, defenses: prev.defenses.map(d => d.id === id ? { ...d, gridX: gx, gridY: gy } : d) }));
    sfx.click();
  };

  const handleTileEdit = (gx: number, gy: number) => {
    if (placingInv && handlePlaceFromInventory(gx, gy)) return;
    if (placingDefense && handlePlaceDefense(gx, gy)) return;
    const bAt = gameState.buildings.find(b => inFootprint(gx, gy, b.gridX, b.gridY));
    const wIdx = gameState.walls.findIndex(w => w.gridX === gx && w.gridY === gy);
    const dAt = gameState.defenses.find(d => d.gridX === gx && d.gridY === gy);
    const busAt = gameState.bus && gameState.bus.gridX === gx && gameState.bus.gridY === gy;
    if (moveSel) {
      if (!bAt && wIdx < 0 && !dAt && !busAt && canPlaceBuilding(moveSel, gx, gy)) {
        pushUndo();
        setGameState(prev => ({ ...prev, buildings: prev.buildings.map(b => b.id === moveSel ? { ...b, gridX: gx, gridY: gy } : b) }));
        sfx.click();
      }
      setMoveSel(null);
      return;
    }
    if (bAt) { setMoveSel(bAt.id); sfx.click(); return; }
    if (dAt) { handleFlipDefense(dAt.id); sfx.click(); return; } // tap equipment = rotate (mirror)
    if (busAt) { handleFlipBus(); sfx.click(); return; }
    if (wIdx >= 0) { pushUndo(); setGameState(prev => ({ ...prev, walls: prev.walls.filter((_, i) => i !== wIdx) })); return; }
    if (gameState.walls.length >= wallCap(stadiumLevel)) { spawnText('Wall limit reached — upgrade your Stadium for more', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return; }
    pushUndo();
    setGameState(prev => ({ ...prev, walls: [...prev.walls, { gridX: gx, gridY: gy }] }));
    sfx.click();
  };

  // Drag-and-drop building move (Design mode) — validated: in-bounds, not onto a building/wall.
  const handleMoveBuilding = (id: string, gx: number, gy: number) => {
    if (!canPlaceBuilding(id, gx, gy)) { sfx.error(); return; }
    pushUndo();
    setGameState(prev => ({ ...prev, buildings: prev.buildings.map(b => b.id === id ? { ...b, gridX: gx, gridY: gy } : b) }));
    sfx.click();
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

      <TopHUD gameState={gameState} onRally={handleRally} />

      <IsometricMap
        buildings={gameState.buildings}
        players={gameState.roster}
        bonusOrbs={gameState.bonusOrbs}
        timeOfDay={gameState.timeOfDay}
        recruitSlot={gameState.recruitSlot}
        upgrades={gameState.upgrades}
        walls={gameState.walls}
        editMode={editMode}
        moveSel={moveSel}
        defenses={gameState.defenses}
        bus={gameState.bus}
        placing={!!(placingDefense || placingInv)}
        externalGhost={carryGhost}
        onTileEdit={handleTileEdit}
        onPaintWall={handlePaintWall}
        onPaintStart={pushUndo}
        onMoveBuilding={handleMoveBuilding}
        onMoveDefense={handleMoveDefense}
        onMoveBus={handleMoveBus}
        onBuildingClick={(b) => {
          if (b.type === BuildingType.YOUTH_ACADEMY) setIsScoutingOpen(true);
          else setSelectedBuilding(b);
        }}
        onCollect={handleCollect}
        onCollectResource={handleCollectResource}
        onOrbClick={() => {}}
      />

      <FloatingTextLayer items={floatingTexts} />

      {/* The carried piece rides the cursor from HUD chip → board */}
      {carry && (
        <img src={carry.sprite} alt="" draggable={false} className="fixed pointer-events-none z-[80]"
          style={{ left: carryPos.x - 38, top: carryPos.y - 52, width: 76, filter: 'drop-shadow(0 12px 10px rgba(0,0,0,0.55))' }} />
      )}

      {isSquadOpen && (
        <SquadModal
          roster={gameState.roster}
          resources={gameState.resources}
          onClose={() => setIsSquadOpen(false)}
          onTrainGroup={handleTrainGroup}
          onOpenHeroes={() => { setIsSquadOpen(false); setIsHeroOpen(true); }}
        />
      )}

      {selectedBuilding && (
          <ActionModal
             building={selectedBuilding}
             resources={gameState.resources}
             stadiumLevel={stadiumLevel}
             upgrades={gameState.upgrades}
             builders={gameState.builders}
             onClose={() => setSelectedBuilding(null)}
             onUpgrade={handleUpgradeBuilding}
             onFinishNow={handleFinishNow}
             onHireBuilder={handleHireBuilder}
          />
      )}

      {isStandingsOpen && (
        <StandingsModal
          gameState={gameState}
          onClose={() => setIsStandingsOpen(false)}
          onPlay={() => { setIsStandingsOpen(false); openRaid(); }}
        />
      )}

      {/* Attack: Season campaign ladder or a live Raid */}
      {attackSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-slate-950 w-full max-w-md max-h-[88vh] rounded-2xl border border-slate-800 shadow-2xl p-6 flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-2xl font-display font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <Swords className="text-red-500" size={26} /> Game Day
                <span className="text-[10px] font-sans font-bold normal-case tracking-normal text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5" title="Suiting up costs Energy — regen at the Rehab Center">⚡{RAID_ENERGY} per game</span>
              </h2>
              <button onClick={() => setAttackSelectOpen(false)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white"><X size={18} /></button>
            </div>
            {/* Mode tabs */}
            <div className="flex gap-2 my-3">
              <button onClick={() => setAttackTab('season')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${attackTab === 'season' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                🏆 Season {gameState.campaign.unlocked > CAMPAIGN_STAGES.length ? '✓' : `${Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length)}/${CAMPAIGN_STAGES.length}`}
              </button>
              <button onClick={() => setAttackTab('raid')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${attackTab === 'raid' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                ⚔️ Raid
              </button>
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
                          <div className="font-bold text-white truncate">{locked ? '🔒 ' : ''}{st.name}{isNext && <span className="ml-2 text-[9px] font-black uppercase bg-orange-500 text-white px-1.5 py-0.5 rounded align-middle">Next game</span>}</div>
                          <div className="text-xs text-slate-400 truncate">{st.opponent} · {coach.name}</div>
                          <div className="text-sm leading-none mt-1">
                            {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < earned ? 1 : 0.22, filter: i < earned ? 'none' : 'grayscale(1)' }}>🏈</span>)}
                          </div>
                          {isNext && <div className="text-[10px] italic text-orange-200/80 mt-1 line-clamp-2">“{coach.intro}”</div>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
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
                        <div className="text-xs text-fuchsia-200/70">🏆 {b.trophies} · {b.layout.filter(x => x.kind !== 'wall').length} buildings · live player</div>
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
                  <div>
                    <div className="font-bold text-white text-lg">{b.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      {Array.from({ length: Math.max(1, Math.min(5, Math.round(b.difficulty))) }).map((_, i) => <Swords key={i} size={11} className="text-red-400 inline" />)}
                      <span>• {b.buildings.filter(x => x.kind !== 'wall').length} buildings</span>
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
        </div>
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
      {!editMode && <ObjectiveBanner gameState={gameState} onGoal={handleGoal} />}
      <TourPointer
        gameState={gameState}
        active={!editMode && !(isSquadOpen || isScoutingOpen || isStandingsOpen || !!selectedBuilding || confirmingReset || showTutorial)}
      />

      {/* 🏈 First visit to the Chalkboard — one card, four moves, then out of the way */}
      {editMode && chalkIntro && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={dismissChalkIntro}>
          <div className="bg-slate-900 w-full max-w-sm rounded-2xl border border-blue-600 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-display font-black text-white uppercase mb-1">📋 The Chalkboard</h3>
            <p className="text-slate-400 text-xs mb-4">Where you scheme your stadium's defense. Five moves:</p>
            <div className="space-y-2.5 text-sm text-slate-200">
              <div className="flex gap-2.5"><span className="shrink-0">✋</span><span><b className="text-white">Drag</b> any building, equipment, or the bus — it rides your finger</span></div>
              <div className="flex gap-2.5"><span className="shrink-0">🫳</span><span><b className="text-white">Drag a chip</b> from the shop or inventory straight onto the board</span></div>
              <div className="flex gap-2.5"><span className="shrink-0">🔄</span><span><b className="text-white">Tap</b> equipment or the bus to rotate it</span></div>
              <div className="flex gap-2.5"><span className="shrink-0">🛑</span><span><b className="text-white">Drag across grass</b> to paint a Blocking Sled line (tap a sled to remove)</span></div>
              <div className="flex gap-2.5"><span className="shrink-0">🛣</span><span>The lines are raider routes: <b className="text-red-300">dashed ➜ = they walk in free</b>, <b className="text-green-300">solid 🔒 = your walls stop them</b>. Seal the dashed ones.</span></div>
            </div>
            <button onClick={dismissChalkIntro} className="mt-5 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors active:scale-95">Chalk it up 🏈</button>
          </div>
        </div>
      )}

      {/* Base design (edit) mode banner */}
      {editMode && (() => {
        const dr = computeDefenseRating(gameState.buildings, gameState.walls, gameState.roster, gameState.resources.FANS, gameState.defenses.length, gameState.parkingLot);
        const defCap = defenseCap();
        const gradeColor = dr.score >= 70 ? '#22c55e' : dr.score >= 40 ? '#eab308' : '#ef4444';
        const Bar = ({ label, v }: { label: string; v: number }) => (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase text-slate-400 font-bold w-16 text-right">{label}</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700"><div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 70 ? '#22c55e' : v >= 40 ? '#eab308' : '#ef4444' }} /></div>
            <span className="text-[10px] font-mono text-slate-300 w-7">{v}</span>
          </div>
        );
        return (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,540px)] bg-slate-900/95 backdrop-blur border border-blue-700 rounded-2xl shadow-xl p-3">
            {/* Slim header — always visible; the board (and the red/green attacker lanes) stay in view */}
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 flex items-baseline gap-1 px-2 py-1 rounded-lg border-2" style={{ borderColor: gradeColor }}>
                <span className="font-display font-black text-xl leading-none" style={{ color: gradeColor }}>{dr.grade}</span>
                <span className="text-[10px] font-mono text-slate-300">{dr.score}</span>
              </div>
              <div className="min-w-0 flex-1 text-[11px] text-slate-400 leading-tight">
                <span className="text-yellow-300 font-bold">{dr.weakness}</span>
                <div className="text-[10px] text-slate-500"><span className="text-red-300">red lanes</span> = raiders walk in free · <span className="text-green-300">green</span> = sealed</div>
              </div>
              <button onClick={handleUndo} disabled={undoCount === 0} title="Undo the last change"
                className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${undoCount === 0 ? 'border-slate-800 text-slate-600 cursor-not-allowed opacity-50' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-yellow-400'}`}>
                ↩︎{undoCount > 0 && <span className="text-[9px] text-slate-400 ml-0.5">{undoCount}</span>}
              </button>
              <button onClick={handleTestDefense} title="Run a scrimmage against this exact layout"
                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-green-700 bg-green-900/30 hover:bg-green-900/60 text-green-200 text-[11px] font-bold transition-colors active:scale-95">
                🧪 Test
              </button>
              <button onClick={() => setDesignExpanded(x => !x)} className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 text-[11px] font-bold transition-colors hover:border-orange-400">
                {designExpanded ? '▴ Less' : '▾ More'}
              </button>
              <button onClick={() => { setEditMode(false); setMoveSel(null); setPlacingDefense(null); setPlacingInv(null); setDesignExpanded(false); clearUndo(); }} className="shrink-0 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold transition-colors active:scale-95">Done</button>
            </div>
            {placingDefense && !designExpanded && <div className="text-[10px] text-green-300 font-bold mt-1.5 animate-pulse">Tap a free tile to install the {DEFENSE_TYPES.find(t => t.kind === placingDefense)?.name}</div>}
            {placingInv && !designExpanded && <div className="text-[10px] text-green-300 font-bold mt-1.5 animate-pulse">Tap a free tile to place it</div>}
            {designExpanded && <>
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-800">
              <div className="flex-1 space-y-1">
                <Bar label="Walls" v={dr.walls} />
                <Bar label="Structure" v={dr.structure} />
                <Bar label="Defenders" v={dr.defenders} />
              </div>
              {dr.crowd > 0 && <span className="text-rose-300 font-bold text-[10px] shrink-0">🔊 +{dr.crowd} crowd</span>}
            </div>
            {/* Defense shop — buy football equipment, then tap a tile to install it */}
            <div className="mt-2 pt-2 border-t border-slate-800">
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5 flex items-center gap-2">
                🛡 Defensive Equipment <span className="font-mono text-slate-500">({gameState.defenses.length}/{defCap})</span>
                {gameState.bonusDefSlots < EXTRA_SLOT_COSTS.length && (
                  <button onClick={handleBuySlot} disabled={gameState.resources.GEMS < EXTRA_SLOT_COSTS[gameState.bonusDefSlots]}
                    title="Buy a permanent extra equipment slot"
                    className={`ml-auto normal-case tracking-normal px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all active:scale-95 ${gameState.resources.GEMS >= EXTRA_SLOT_COSTS[gameState.bonusDefSlots] ? 'border-purple-500 bg-purple-900/30 hover:bg-purple-900/60 text-purple-200' : 'border-slate-800 text-slate-600 cursor-not-allowed opacity-60'}`}>
                    +1 Slot · {EXTRA_SLOT_COSTS[gameState.bonusDefSlots]}👑
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                {DEFENSE_TYPES.map(t => {
                  const affordable = gameState.resources.COINS >= t.cost;
                  const capped = gameState.defenses.length >= defCap;
                  const active = placingDefense === t.kind;
                  return (
                    <button key={t.kind} onPointerDown={e => { if (affordable && !capped) startCarry(e, 'shop', t.kind, t.sprite); }} disabled={!affordable || capped} title={`${t.name} — ${t.desc} · DMG ${t.damage} · RNG ${t.range} · drag onto the board to buy & place`}
                      style={{ touchAction: 'none' }}
                      className={`flex-1 flex flex-col items-center py-1.5 rounded-lg border text-[9px] font-bold transition-all active:scale-95 cursor-grab
                        ${active ? 'border-green-400 bg-green-900/40 text-white' : (!affordable || capped) ? 'border-slate-800 text-slate-600 cursor-not-allowed opacity-50' : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:border-orange-400'}`}>
                      <span className="text-base leading-none">{t.emoji}</span>
                      <span className="leading-tight mt-0.5">{t.name.split(' ')[0]}</span>
                      <span className="text-yellow-400 font-mono">{t.cost >= 1000 ? `${(t.cost / 1000).toFixed(1)}k` : t.cost}</span>
                    </button>
                  );
                })}
              </div>
              {placingDefense && <div className="text-[10px] text-green-300 font-bold mt-1 animate-pulse">Tap a free tile to install the {DEFENSE_TYPES.find(t => t.kind === placingDefense)?.name}</div>}
              {/* 🅿️ Parking Lot + 🔊 Crowd — the outer layers of the defense-in-depth flow */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 flex items-center gap-1.5 text-[10px] text-slate-300">
                  <span className="font-bold">🅿️ Parking Lot</span>
                  {[1, 2, 3].map(l => <span key={l} className={`w-2 h-2 rounded-sm ${l <= gameState.parkingLot ? 'bg-orange-400' : 'bg-slate-700'}`} />)}
                  <span className="text-slate-500">{gameState.parkingLot > 0 ? `+${Math.round(gameState.parkingLot * 5.5)}% longer approach` : 'raiders reach you fast'}</span>
                </div>
                {gameState.parkingLot < PARKING_LOT.maxLevel && (
                  <button onClick={handlePaveParkingLot} disabled={gameState.resources.COINS < PARKING_LOT.costs[gameState.parkingLot]}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all active:scale-95 ${gameState.resources.COINS >= PARKING_LOT.costs[gameState.parkingLot] ? 'border-orange-500 bg-orange-900/30 hover:bg-orange-900/60 text-orange-200' : 'border-slate-800 text-slate-600 cursor-not-allowed opacity-60'}`}>
                    Pave L{gameState.parkingLot + 1} · {(PARKING_LOT.costs[gameState.parkingLot] / 1000).toFixed(0)}k 🪙
                  </button>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                🔊 Home crowd: {gameState.resources.FANS >= 300
                  ? <span className="text-rose-300 font-bold">{gameState.resources.FANS.toLocaleString()} fans stall enemy drives ~{(0.8 + Math.min(1.7, gameState.resources.FANS / 1500)).toFixed(1)}s every 10s</span>
                  : <span className="text-slate-500">under 300 fans — too quiet to rattle raiders yet</span>}
              </div>
            </div>
            {/* 📦 Inventory — stored pieces waiting to go back on the board */}
            {(() => {
              const inv = gameState.inventory;
              const defCounts: Record<string, number> = {};
              inv.defenses.forEach(d => { defCounts[d.kind] = (defCounts[d.kind] || 0) + 1; });
              const hasStored = inv.sleds > 0 || inv.bus || inv.defenses.length > 0;
              const hasOnBoard = gameState.walls.length > 0 || gameState.defenses.length > 0 || !!gameState.bus;
              const Chip = ({ label, emoji, count, active, onPick }: any) => (
                <button onPointerDown={onPick} style={{ touchAction: 'none' }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all active:scale-95 cursor-grab ${active ? 'border-green-400 bg-green-900/40 text-white animate-pulse' : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:border-orange-400'}`}>
                  <span>{emoji}</span>{label}{count > 1 && <span className="text-orange-300">×{count}</span>}
                </button>
              );
              return (
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">📦 Inventory</span>
                  {inv.sleds > 0 && <Chip label="Sled" emoji="🛑" count={inv.sleds} active={placingInv?.type === 'sled'} onPick={(e: React.PointerEvent) => startCarry(e, 'sled', undefined, '/assets/battle/blocking-sled.png')} />}
                  {Object.entries(defCounts).map(([kind, n]) => {
                    const t = DEFENSE_TYPES.find(x => x.kind === kind);
                    return <Chip key={kind} label={t?.name.split(' ')[0] ?? kind} emoji={t?.emoji ?? '🛡'} count={n} active={placingInv?.type === 'defense' && placingInv.kind === kind} onPick={(e: React.PointerEvent) => startCarry(e, 'defense', kind, t?.sprite ?? '')} />;
                  })}
                  {inv.bus && <Chip label="Team Bus" emoji="🚌" count={1} active={placingInv?.type === 'bus'} onPick={(e: React.PointerEvent) => startCarry(e, 'bus', undefined, '/assets/decor/team-bus.png')} />}
                  {!hasStored && <span className="text-[10px] text-slate-600 italic">empty — Store All sweeps the board in here</span>}
                  {(placingInv || hasStored) && <span className="text-[10px] text-green-300 font-bold w-full">{placingInv ? 'Tap a free tile to place it — or just drag a chip onto the board' : 'Drag a chip straight onto the board, or tap it then tap tiles'}</span>}
                  {hasOnBoard && (
                    <button onClick={handleStoreAll} className="ml-auto px-2.5 py-1 rounded-lg border border-blue-600 bg-blue-900/30 hover:bg-blue-900/60 text-blue-200 text-[10px] font-bold transition-all active:scale-95">
                      📦 Store All
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="text-[10px] text-slate-500 mt-1.5">
              <span className="text-yellow-300 font-bold">Drag</span> pieces to move • <span className="text-yellow-300 font-bold">Tap</span> equipment/bus to rotate • <span className="text-yellow-300 font-bold">Drag on grass</span> to paint Blocking Sleds ({gameState.walls.length}/{wallCap(stadiumLevel)} — grows with Stadium)
            </div>
            </>}
          </div>
        );
      })()}

      {/* Daily Practice (quests) */}
      <button
        onClick={() => setIsDailyOpen(true)}
        className="fixed bottom-24 right-3 z-40 text-xl bg-slate-900/90 border border-slate-700 hover:border-rose-400 p-2.5 rounded-2xl shadow-xl transition-colors"
        title="Daily Practice"
      >
        <span className="relative flex items-center">
          🎁
          {dailyClaimable > 0 && (
            <span className="absolute -top-2 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 border border-slate-900 text-[9px] font-bold text-white flex items-center justify-center leading-none animate-pulse">{dailyClaimable}</span>
          )}
        </span>
      </button>

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
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <div className="text-sm text-slate-400">Start a brand-new franchise</div>
                <button onClick={() => { setSettingsOpen(false); setConfirmingReset(true); }} className="px-3 py-1.5 rounded-lg border border-red-900 text-red-400 hover:bg-red-950/50 text-sm font-bold transition-colors">Reset…</button>
              </div>
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
        <div className="flex justify-between items-center max-w-md mx-auto pb-4">
          <NavBtn icon={<Users />} label="Coach" active={isSquadOpen} onClick={() => setIsSquadOpen(true)} tourId="coach" />

          <NavBtn icon={<Star />} label="Heroes" active={isHeroOpen} onClick={() => setIsHeroOpen(true)} />

          <NavBtn icon={<Shield />} label="Defend" onClick={openDefenseLog} badge={unseenDefenses} />

          <div
             data-tour="trophy"
             onClick={openRaid}
             className="-mt-10 p-5 rounded-full border-4 shadow-2xl cursor-pointer hover:scale-105 transition-transform bg-red-600 border-red-400 hover:bg-red-500"
          >
             <Swords size={32} className="text-white" />
          </div>

          <NavBtn icon={<Calendar />} label="Standings" onClick={() => setIsStandingsOpen(true)} />

          <NavBtn icon={<ClipboardList />} label="Chalkboard" active={editMode} tourId="design" onClick={() => { setEditMode(true); setMoveSel(null); setSelectedBuilding(null); }} />
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
