import type { PostBattleDestination } from './game/battleDebrief';

import { applyCampusLayout, type CampusLayout } from './game/campusLayout';
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { heroPracticeConfig, isNonProgressionBattle, canRefundRaidEnergy } from './game/combat/practice';

const CampusEditor = React.lazy(() => import('./components/CampusEditor').then(m => ({ default: m.CampusEditor })));

const CCBtn = ({ label, emoji, onClick, disabled, accent }: { label: string; emoji: string; onClick: () => void; disabled?: boolean; accent?: boolean }) => (
  <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
    className={`flex flex-col items-center gap-1 w-[74px] py-2.5 rounded-xl border-2 shadow-xl transition-all active:scale-90 pointer-events-auto
      ${disabled ? 'border-slate-700 bg-slate-900/90 opacity-50' : accent ? 'border-yellow-500 bg-gradient-to-b from-slate-800 to-slate-900 hover:border-yellow-300' : 'border-slate-600 bg-gradient-to-b from-slate-800 to-slate-900 hover:border-slate-400'}`}>
    <span aria-hidden="true" className="text-2xl leading-none drop-shadow">{emoji}</span>
    <span className="text-[10px] font-black uppercase text-white leading-none">{label}</span>
  </button>
);

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
import { GameState, ResourceType, BuildingInstance, BuildingType, DrillState, FloatingText, PlayerState, UnitGroup, Player, UpgradeJob, DefenseLogEntry } from './types';
import { DRILLS, RECRUIT_CONFIG, COLLECTOR_CONFIG, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, trainingYieldMult, warRoomReadinessMult, OPPONENTS, DEFENSE_TYPES, RAID_ENERGY, PARKING_LOT, EXTRA_SLOT_COSTS, BUILDING_INFO, UPGRADE_CONFIG, buildingEffect } from './constants';
import { rosterCap, recruitSeconds } from './recruiting';
import { sfx, toggleMute, isMuted } from './sound';
import { IsometricMap } from './components/IsometricMap';
import { TopHUD } from './components/TopHUD';
import { SquadModal } from './components/SquadModal';
import { ActionModal } from './components/ActionModal';
import { ScoutingModal } from './components/ScoutingModal';
import { MatchPreparation } from './components/MatchPreparation';
import type { GamePlanKey } from './battle';
import { StandingsModal } from './components/StandingsModal';
import { ClubDashboard } from './components/ClubDashboard';
import { TutorialOverlay } from './components/TutorialOverlay';
import { ObjectiveBanner } from './components/ObjectiveBanner';
import { TourPointer } from './components/TourPointer';
import { GoalId } from './objectives';
import { computeDefenseRating } from './defense';
import { displayAnchorOf } from './constants';
import { generateRaidTargets, EnemyBase } from './battle';
import { rankFor, trophiesForRaid, trophiesLostOnDefense, clubPower } from './ranks';
import { rollHero, RollResult, ROLL_COST_GEMS, STAR_UP_COSTS, MAX_STARS } from './gacha';
import { CAMPAIGN_STAGES, campaignBase, coachForStage, coachForBase, preloadCoachArt, preloadNextCoaches, crestForTeam } from './campaign';
import { questsForDate, todayKey, SWEEP_BONUS_GEMS } from './dailies';
import { subscribeCloudWriteStatus, acceptCloudRevision, type CloudSave, getCloudWriteStatus, retryAttackReports, pendingAttackReports, fetchAttackInbox, fetchAttackInboxBaseline, playerId, pvpEnabled, publishBase, findOpponents, reportAttack, fetchAttacksOnMe, fetchBase, LiveBase, getProfile, linkAccount, signInWithPassword, signOutToGuest, fetchCloudSave, pushCloudSave, deleteCloudData, unpublishBase, ProfileInfo } from './pvp';
import { track, trafficSource } from './analytics';
import { DailyQuestsModal } from './components/DailyQuestsModal';

import { FORMATIONS, FORMATION_ORDER, FormationKey, formationDef, formationUnlocked, anchorsFor, slotsFor, slotById, slotUnlocked, slotUpgradeCost, MAX_SLOT_LEVEL, slotHpMult, slotDmgMult, wallsFor, wallHpFor, gatePostsFor, masteryLevel, nextMasteryAt } from './fixedBase';
import { defenseSprite, DEFENSE_ART_GATES } from './assets';

import type { BattleResult, BattleConfig } from './components/BattleScreen';
// Keep play-critical screens with this build: an open game must survive a deployment.
import { BattleScreen } from './components/BattleScreen';
import { GameNavigation } from './components/GameNavigation';
import { BACKUP_KEYS, createBackup } from './backup';
import { createInitialState, genTeamName } from './game/initialState';
import { loadState, SAVE_KEY, TUTORIAL_KEY, parseSavedClub } from './game/persistence';
import { layoutFromFixedBase } from './game/defenseLayout';
import { createDefenseSnapshot, defenseBattleFields } from './game/defenseSnapshot';
import { useAuthority, type AuthorityActionReceipt } from './game/online/useAuthority';
import { checkClubName } from './game/clubName';
import type { MatchChoice } from './game/authority/matches';
import { finishUpgradeNow } from './game/upgrades';
import { rosterPreparation } from './game/combat/roster';
import { validateReplay } from './game/combat/replay';
import { advanceCampus } from './game/campus';
import { fanMilestoneTotal, nextFanMilestone, rallyFans, rallyPreview } from './game/fanProgress';
import { applyAttackInbox, establishDefenseInbox, defenseCursor } from './game/online/defenseInbox';
import { isArchivedAiRaid } from './game/defenseHistory';
import { useUpgradeCelebrations } from './game/useUpgradeCelebrations';
import { Sheet, Btn, HowTo } from './components/ui';
import { armyFromRoster, armyStrength, heroesForBattle, HERO_DEFS, heroMaxLevel, defenseAiTroops, specialsForBattle, raidAiMult, makeRevengeBase, homeDefenders, gauntletWaves, gauntletReward, GAUNTLET_MAX_TIER } from './battle';
import { HeroModal } from './components/HeroModal';
import { DefenseLogModal } from './components/DefenseLogModal';
import { FloatingTextLayer } from './components/FloatingTextLayer';
import { Volume2, VolumeX, X, Shield, Settings as SettingsIcon } from 'lucide-react';


function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadState());
  // ☁️ PROTECTED CLUBS: when the signed-in account has a server club, every club change and
  // every match is confirmed by the club-authority service and the local state is a mirror
  // of the last confirmed answer. Legacy cloud sync/publishing is bypassed for such clubs.
  const applyAuthorityState = useCallback((state: GameState) => setGameState(state), []);
  const authority = useAuthority({ applyState: applyAuthorityState });
  const authorityRef = useRef(authority);
  authorityRef.current = authority;
  // The open server match for the battle on screen: begin is sent at kickoff, finish after the whistle.
  const authorityMatchRef = useRef<{ matchId: string; begun: boolean } | null>(null);
  const [isSquadOpen, setIsSquadOpen] = useState(false);
  const [isScoutingOpen, setIsScoutingOpen] = useState(false);
  const [isStandingsOpen, setIsStandingsOpen] = useState(false);
  const [standingsTab, setStandingsTab] = useState<'live' | 'ladder' | undefined>(undefined);
  const [attackSelectOpen, setAttackSelectOpen] = useState(false);
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null);
  const [preparedMatch, setPreparedMatch] = useState<{config: BattleConfig; choice?: MatchChoice} | null>(null);
  const [preparedPlan, setPreparedPlan] = useState<GamePlanKey>('balanced');
  const [openingHero, setOpeningHero] = useState<string | undefined>();
  const [practiceTake, setPracticeTake] = useState(0);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingInstance | null>(null);
  const [campusEditorOpen, setCampusEditorOpen] = useState(false);
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
  const [focusedHero, setFocusedHero] = useState<string | undefined>();
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
  // and it's gone. Export progress only; sign-in credentials stay on the device.
  const exportSave = () => {
    const bundle = createBackup(localStorage);
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
      parseSavedClub(b.fhq_save_v1); // reject malformed progress before replacing the current club
      setImportPending(b); // in-app confirm (never native dialogs)
    }).catch(() => { sfx.error(); spawnText("That file isn't a Football HQ backup", window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); });
  };
  const applyImport = () => {
    if (!importPending) return;
    const KEYS = BACKUP_KEYS;
    // Suppress the autosave AND write the bundle immediately — the old listener-order
    // trick relied on beforeunload, which iOS Safari doesn't fire reliably (the
    // import would silently no-op on the platform we actually ship on).
    suppressPersistRef.current = true;
    for (const k of KEYS) {
      const v = (importPending as Record<string, string | null>)[k];
      if (v != null) try { localStorage.setItem(k, v); } catch { /* quota */ } // absent keys KEEP current values — a save-only bundle must not wipe your PvP identity
    }
    location.reload();
  };

  const finishTutorial = (rawName: string, startRaid: boolean) => {
    // One club-name rule (game/clubName.ts): the tutorial input caps at 24, but the stored
    // name is whatever the shared rule accepts; a name it refuses keeps the generated one.
    const named = checkClubName(rawName);
    const teamName = named.ok ? named.name : stateRef.current.teamName;
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    track('club_created', { startRaid, nameLen: teamName.length });
    track('tutorial_choice', { stormFirst: startRaid });
    setShowTutorial(false);
    void (async () => {
      const authority = authorityRef.current;
      if (authority.isActiveNow()) { void authority.dispatch({ type: 'club.rename', name: teamName }); }
      else {
        setGameState(prev => ({ ...prev, teamName }));
        // New clubs are protected from the first minute when the club server is reachable:
        // the pristine club is admitted with its chosen name and every later change is
        // confirmed by the server. If the service is unreachable or refuses, local play
        // continues unchanged and Settings offers protection later.
        if (pvpEnabled() && authority.ready && !authority.locked) {
          const admitted = await authority.enable({ ...stateRef.current, teamName });
          track('authority_enable', { origin: 'tutorial', ok: admitted.ok });
          if (!admitted.ok) authority.setNotice(admitted.message);
        }
        if (pvpEnabled() && !authorityRef.current.isActiveNow()) setTimeout(() => publishBase(teamName, stateRef.current.trophies, layoutFromFixedBase(stateRef.current.buildings, stateRef.current.roster, stateRef.current.defenseSlots, stateRef.current.parkingLot, stateRef.current.formation, stateRef.current.formationMastery[stateRef.current.formation] ?? 0)), 400);
      }
      if (startRaid && !startCampaign(1, teamName)) openRaid(); // fall back if the game can't launch
    })();
    return;
    // "Storm your first rival!" must actually storm a rival. It used to open the GAME DAY
    // panel — four tabs, a currency lesson, and a wall of jargon — so a first-timer who
    // asked to play got a manual instead. 19 of the first 20 coaches never reached a
    // single trophy. Drop them straight into the Preseason Opener; the systems can
    // introduce themselves once the player has actually snapped a ball.
  };

  // ⌨️ Esc closes the topmost sheet (D5: minimum keyboard support).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (preparedMatch) setPreparedMatch(null);
      else if (importPending) setImportPending(null);
      else if (settingsOpen) setSettingsOpen(false);
      else if (confirmingReset) setConfirmingReset(false);
      else if (isDailyOpen) setIsDailyOpen(false);
      else if (defenseLogOpen) setDefenseLogOpen(false);
      else if (dashboardOpen) setDashboardOpen(false);
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
  }, [preparedMatch, importPending, settingsOpen, confirmingReset, isDailyOpen, defenseLogOpen, dashboardOpen, isHeroOpen, isStandingsOpen, isScoutingOpen, isSquadOpen, attackSelectOpen, frontOfficeOpen, selectedBuilding]);

  // (The vega300 owner boost — URL param + redeem code — was REMOVED for launch,
  // July 11 2026: cheats must not exist once cloud saves can sync them forever.)

  // ── ☁️ PROFILES & CLOUD SAVES ────────────────────────────────────────────────
  // Anonymous-first: everyone plays instantly on the device identity; linking an
  // email upgrades that SAME identity (uid/pid keep, base + raid history carry).
  // Sync rule: newest wins, and the losing local save is backed up first.
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [cloudSyncPaused,setCloudSyncPaused]=useState(()=>{try{return localStorage.getItem('fhq_cloud_sync_paused')==='1';}catch{return false;}});
  const cloudSyncPausedRef=useRef(cloudSyncPaused);
  const pauseCloudSync=(paused:boolean)=>{cloudSyncPausedRef.current=paused;setCloudSyncPaused(paused);try{localStorage.setItem('fhq_cloud_sync_paused',paused?'1':'0');}catch{/* Current session still respects the choice. */}};
  const [cloudConflict, setCloudConflict] = useState<{ownerId:string;save:CloudSave|null} | undefined>(undefined);
  const [onlineNotice, setOnlineNotice] = useState<string | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  useEffect(() => subscribeCloudWriteStatus(status => {
    setCloudMsg(status.status === 'saved' ? 'Club saved to the cloud ✓' : status.message ?? null);
    if(status.status === 'conflict') { const ownerId=playerId(); void fetchCloudSave().then(result=>{
      if(result.status !== 'error' && playerId()===ownerId) setCloudConflict({ownerId,save:result.status === 'found' ? result.save : null});
    }); }
  }), []);
  useEffect(() => {
    const retry = () => { void retryAttackReports().then(()=> {
      const pending=pendingAttackReports();
      setOnlineNotice(pending.length ? `${pending.length} game report${pending.length===1?'':'s'} awaiting confirmation. Open Settings for details.` : null);
    }); };
    retry(); window.addEventListener('online',retry);
    return ()=>window.removeEventListener('online',retry);
  },[]);
  const profileRef = useRef<ProfileInfo | null>(null);
  profileRef.current = profile;
  // Seeded to NOW, not 0. At 0, the very first 2s autosave tick that saw a signed-in
  // profile would push immediately — which could fire while the boot cloud-sync was
  // still deciding which save is newer, shoving a stale local club over a fresher cloud
  // one and then "winning" the recency check on the way back down.
  const lastCloudPushRef = useRef(Date.now());
  // The trickle push must not run until the boot sync has settled who wins.
  const bootSyncDoneRef = useRef(false);

  // The cloud row has a hard 500KB cap (server-side check constraint). Replay film
  // can push a save past it — and an oversize push 400s SILENTLY on every retry
  // forever. Slim the pushed copy (drop replay blobs, oldest first) until it fits.
  const slimForCloud = (gs: GameState): GameState => {
    let out = gs;
    if (JSON.stringify(out).length > 450_000) out = { ...out, defenseLog: out.defenseLog.map(en => en.replay ? { ...en, replay: undefined } : en) };
    if (JSON.stringify(out).length > 450_000) out = { ...out, defenseLog: [], matchHistory: out.matchHistory.slice(0, 10) };
    return out;
  };
  const pushSaveToCloud = async (): Promise<boolean> => {
    if(cloudSyncPausedRef.current || authorityRef.current.active)return false;
    const ok = await pushCloudSave(slimForCloud(stateRef.current), stateRef.current.teamName || 'Club', clubPower(stateRef.current));
    if (ok) lastCloudPushRef.current = Date.now();
    return ok;
  };

  // The device's TRUE last-played stamp, captured BEFORE this session's autosave
  // starts refreshing it. The old comparison used lastTick — which loadState resets
  // to Date.now() on every boot — so a laptop untouched for a week still looked
  // "newer" than the cloud and silently overwrote a week of phone progress.
  const [bootSavedAt] = useState(() => { try { return Number(localStorage.getItem('fhq_saved_at') ?? 0); } catch { return 0; } });
  // While a cloud save is being applied, the autosave (interval/beforeunload/pagehide)
  // must NOT write the old state back over it during the reload.
  const suppressPersistRef = useRef(false);

  /** Pull the cloud save; apply it (backup + reload) if it's meaningfully newer,
   *  otherwise push the local club up. force=true always applies cloud (fresh
   *  device sign-in). localRecency = when this device last recorded progress
   *  (boot passes the pre-session stamp; an actively-played session is "now"). */
  const syncWithCloud = async (force = false, localRecency?: number): Promise<'applied' | 'pushed' | 'error' | 'none' | 'conflict'> => {
    if(cloudSyncPausedRef.current || authorityRef.current.active)return 'none'; // protected clubs are settled by the authority, not the cloud table
    const ownerId=playerId();
    const res = await fetchCloudSave();
    if(playerId()!==ownerId || cloudSyncPausedRef.current) return 'error';
    // NEVER push on an error. A timed-out lookup used to be indistinguishable from an
    // empty account, so a network blip during sign-in would overwrite a real club in
    // the cloud with the fresh local one — and then report "saved ✓". Back off instead:
    // the local save is untouched and the next sync can try again.
    if (res.status === 'error') return 'error';
    if (res.conflict) { setCloudConflict({ownerId,save:res.status === 'found' ? res.save : null});setCloudMsg('Another device changed this club. Choose which progress to keep.');return 'conflict'; }
    if (res.status === 'empty') {
      const pushed = await pushSaveToCloud();
      return pushed ? 'pushed' : 'none';
    }
    const cloud = res.save;
    if (!cloud.save) return 'none';
    try { parseSavedClub(JSON.stringify(cloud.save)); } catch { return 'error'; }
    const cloudTime = Date.parse(cloud.updated_at);
    const localTime = localRecency ?? Date.now();
    if (force || cloudTime > localTime + 90000) { // 90s skew guard — ties keep local
      suppressPersistRef.current = true; // the unload flush must not resurrect the old save
      try {
        try { localStorage.setItem('fhq_backup_precloud', localStorage.getItem(SAVE_KEY) ?? ''); } catch { /* best effort */ }
        localStorage.setItem(SAVE_KEY, JSON.stringify(cloud.save));
        try { localStorage.setItem('fhq_saved_at', String(cloudTime || Date.now())); } catch { /* best effort */ }
        acceptCloudRevision(cloud.updated_at);
        sessionStorage.setItem('fhq_cloud_applied', '1'); // reload-loop guard
      } catch {
        suppressPersistRef.current = false; // write failed (quota/private mode) — re-enable autosave, do NOT strand the session unsaved
        return 'none';
      }
      window.location.reload();
      return 'applied';
    }
    const pushed = await pushSaveToCloud();
    return pushed ? 'pushed' : 'none';
  };

  const resolveCloudConflict = async (choice:'cloud'|'device') => {
    if(cloudConflict === undefined) return;
    if(cloudConflict.ownerId!==playerId()){setCloudConflict(undefined);return;}
    const chosen=cloudConflict.save;
    if(choice === 'cloud') {
      if(!chosen) return;
      try {
        parseSavedClub(JSON.stringify(chosen.save));
        suppressPersistRef.current=true;
        localStorage.setItem('fhq_backup_precloud',JSON.stringify(stateRef.current));
        localStorage.setItem(SAVE_KEY,JSON.stringify(chosen.save));
        localStorage.setItem('fhq_saved_at',String(Date.parse(chosen.updated_at)));
        sessionStorage.setItem('fhq_cloud_applied','1');
        acceptCloudRevision(chosen.updated_at);
        window.location.reload();
      } catch {suppressPersistRef.current=false;setCloudMsg('Could not load the cloud club. Both versions are preserved.');}
    } else {
      acceptCloudRevision(chosen?.updated_at ?? null);
      if(await pushSaveToCloud()) {setCloudConflict(undefined);setCloudMsg('This device’s club is saved to the cloud.');}
    }
  };
  const bootSyncStartedRef = useRef(false);
  useEffect(() => {
    // Protection detection settles first: a protected club must never be overwritten by
    // a stale cloud save on a fresh device, and it never pushes to the legacy cloud table.
    if (!pvpEnabled() || !authority.ready || bootSyncStartedRef.current) return;
    bootSyncStartedRef.current = true;
    const justApplied = sessionStorage.getItem('fhq_cloud_applied');
    if (justApplied) sessionStorage.removeItem('fhq_cloud_applied');
    getProfile().then(async p => {
      setProfile(p);
      // Linked accounts sync on boot (skip the pull right after applying a
      // cloud save — that reload IS the sync); guests stay local-only.
      // Recency = the stamp from BEFORE this session started (see bootSavedAt).
      if (!authorityRef.current.active && (p?.email || p?.pendingEmail) && !justApplied) await syncWithCloud(false, bootSavedAt);
      bootSyncDoneRef.current = true; // only now may the autosave trickle-push to the cloud
    }).catch(() => { bootSyncDoneRef.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority.ready]);


  // Keep a live ref of state so the autosave interval always writes the latest.
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // --- AUTOSAVE ---
  useEffect(() => {
    const persist = () => {
      if (suppressPersistRef.current) return; // a cloud save is being applied — don't resurrect the old state
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(stateRef.current));
        localStorage.setItem('fhq_saved_at', String(Date.now())); // true last-played stamp (cloud sync recency)
      } catch (e) {
        console.warn('Save failed:', e);
      }
      // ☁️ linked clubs (active OR pending-confirm — same uid either way) trickle
      // up to the cloud once a minute, quietly
      if (!cloudSyncPausedRef.current && !authorityRef.current.active && bootSyncDoneRef.current && (profileRef.current?.email || profileRef.current?.pendingEmail) && Date.now() - lastCloudPushRef.current > 60000) {
        lastCloudPushRef.current = Date.now(); // set BEFORE the await — no double-fire
        pushCloudSave(slimForCloud(stateRef.current), stateRef.current.teamName || 'Club', clubPower(stateRef.current)).catch(() => { /* offline — next tick */ });
      }
    };
    const saveLoop = setInterval(persist, 2000);
    window.addEventListener('beforeunload', persist);
    window.addEventListener('pagehide', persist); // iOS Safari: beforeunload is unreliable — pagehide is the real unload event
    return () => {
      clearInterval(saveLoop);
      window.removeEventListener('beforeunload', persist);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, []);

  // Warm ONLY the next opponent or two. Preloading all 18 coach portraits on a boot
  // timer pulled 731 KB (23% of the page) onto the home screen — for a screen that 18
  // of the first 19 real coaches never even reached. The full set is warmed when Game
  // Day actually opens (see openRaid), which is the moment it can matter.
  useEffect(() => {
    const t = setTimeout(() => preloadNextCoaches(stateRef.current.campaign?.unlocked ?? 1), 2500);
    return () => clearTimeout(t);
  }, []);

  // The transition is deterministic and side-effect free; presentation follows commits.
  useUpgradeCelebrations(gameState.upgrades, gameState.buildings, setCelebration);
  useEffect(() => {
    // Protected clubs keep the club server's calendar (UTC day) so daily quests and Gauntlet
    // attempts never flip between two calendars; guest clubs keep the local-midnight reset.
    const tick = () => { if (document.hidden) return; const now = Date.now(); setGameState(prev => advanceCampus(prev, now, authorityRef.current.isActiveNow() ? new Date(now).toISOString().slice(0, 10) : undefined)); };
    const loop = setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(loop); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const spawnText = (text: string, x: number, y: number, color: string = '#fbbf24') => {
    const id = Date.now() + Math.random();
    setFloatingTexts(prev => [...prev, { id, text, x, y, color }]);
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
    }, 1000);
  };

  // Protected clubs: route a club change through the authority. Returns true when the
  // change was taken over (the caller must not mutate local state). Effects run only on
  // the server's confirmation; a pending answer is retried by the ledger and surfaced in Settings.
  const protectedAction = (action: Record<string, unknown>, onConfirmed?: (receipt: AuthorityActionReceipt | null) => void): boolean => {
    if (pvpEnabled() && !authority.ready) { authority.setNotice('Connecting your club. Try again after Settings shows its status.'); return true; }
    if (authority.locked) { sfx.error(); spawnText('Sign in as this club\'s owner to make changes', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); return true; }
    if (!authority.isActiveNow()) return false;
    void authority.dispatch(action).then(outcome => {
      if (outcome.status === 'confirmed') { authority.setNotice(null); onConfirmed?.((outcome.answer.result as AuthorityActionReceipt | null) ?? null); }
      else if (outcome.status === 'failed') { sfx.error(); spawnText(outcome.message, window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); authority.setNotice(outcome.message); }
      else { authority.setNotice(outcome.message); spawnText('Waiting for online confirmation…', window.innerWidth / 2, window.innerHeight / 2, '#94a3b8'); }
    });
    return true;
  };
  const centerText = (text: string, color = '#fbbf24', dy = 0) => spawnText(text, window.innerWidth / 2, window.innerHeight / 2 + dy, color);

  // --- HANDLERS ---
  const handleTrainGroup = (unit: UnitGroup, drillId: string) => {
    if (protectedAction({ type: 'training.start', drillId, unit }, () => { sfx.click(); setIsSquadOpen(false); })) return;
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
     if (protectedAction({ type: 'training.collect', buildingId: building.id }, receipt => { const coins = Number((receipt?.gained as Record<string, number> | undefined)?.COINS ?? 0); spawnText(`+${coins} Coins`, screenPos.x, screenPos.y, '#fbbf24'); spawnCoinArc(screenPos, coins); spawnText('Squad +1 LVL', screenPos.x, screenPos.y - 30, '#3b82f6'); sfx.collect(); })) return;
     const drill = DRILLS[building.activeDrillId];

     // Training Field level boosts the coin payout of every drill (its real, wired effect).
     const pitch = gameState.buildings.find(b => b.type === 'TRAINING_PITCH');
     const drillCoins = Math.round(drill.rewardCoins * trainingYieldMult(pitch ? pitch.level : 1));

     setGameState(prev => {
       // War Room (Tactics) sharpens the game plan → more readiness per drill.
       const warRoom = prev.buildings.find(b => b.type === 'TACTICS_ROOM');
       const readinessGain = drill.readinessGain * warRoomReadinessMult(warRoom ? warRoom.level : 1);
       const newReadiness = Math.min(100, prev.teamReadiness + readinessGain);

       return {
         ...prev,
         resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS + drillCoins },
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

     spawnText(`+${drillCoins} Coins`, screenPos.x, screenPos.y, '#fbbf24');
     spawnCoinArc(screenPos, drillCoins);
     spawnText('Squad +1 LVL', screenPos.x, screenPos.y - 30, '#3b82f6'); // the REAL reward — the old float advertised XP that no system ever recorded
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
    if (protectedAction({ type: 'facility.upgrade', buildingId }, receipt => { setSelectedBuilding(null); sfx.click(); centerText('Under construction…', '#60a5fa'); track('building_upgrade', { type: building.type, toLevel: Number(receipt?.toLevel ?? building.level + 1), protected: true }); })) return;
    if (gameState.upgrades.length >= gameState.builders) { spawnText('All builders busy!', window.innerWidth / 2, window.innerHeight / 2, '#ef4444'); sfx.error(); return; }
    if (gameState.upgrades.some(u => u.kind === 'building' && u.key === buildingId)) return;
    if (gameState.resources.COINS < cost) { sfx.error(); return; }
    const toLevel = building.level + 1;
    const now = Date.now();
    const job: UpgradeJob = { id: newJobId(), kind: 'building', key: buildingId, toLevel, startTime: now, finishTime: now + upgradeDurationSecs(toLevel) * 1000 };
    setGameState(prev => {
      // re-check EVERY guard against prev — a double-tap raced the closure checks
      // above and could queue two jobs / charge twice for one level
      if (prev.upgrades.length >= prev.builders) return prev;
      if (prev.upgrades.some(u => u.kind === 'building' && u.key === buildingId)) return prev;
      if (prev.resources.COINS < cost) return prev;
      return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost }, upgrades: [...prev.upgrades, job] };
    });
    setSelectedBuilding(null);
    sfx.click();
    spawnText('Under construction…', window.innerWidth / 2, window.innerHeight / 2, '#60a5fa');
    track('building_upgrade', { type: building.type, toLevel });
  };

  const handleFinishNow = (jobId: string) => {
    if (protectedAction({ type: 'facility.rush', jobId }, receipt => { setSelectedBuilding(null); sfx.upgrade(); const gems = Number((receipt?.spent as Record<string, number> | undefined)?.GEMS ?? 0); centerText(gems > 0 ? 'Rushed!' : 'Upgrade complete!', '#a78bfa'); })) return;
    const now = Date.now();
    const before = stateRef.current;
    const job = before.upgrades.find(upgrade => upgrade.id === jobId);
    const preview = finishUpgradeNow(before, jobId, now);
    setGameState(previous => finishUpgradeNow(previous, jobId, now));
    if (!job || preview.upgrades.some(upgrade => upgrade.id === jobId)) return;
    setSelectedBuilding(null);
    sfx.upgrade();
    const gems = before.resources.GEMS - preview.resources.GEMS;
    spawnText(gems > 0 ? 'Rushed!' : 'Upgrade complete!', window.innerWidth / 2, window.innerHeight / 2, '#a78bfa');
    if (gems > 0) track('upgrade_finish_now', { gems, kind: job.kind });
  };

  const handleHireBuilder = () => {
    if (protectedAction({ type: 'builder.hire' }, () => { sfx.upgrade(); centerText('Builder hired!', '#4ade80'); })) return;
    setGameState(prev => {
      if (prev.builders >= MAX_BUILDERS) return prev;
      const cost = builderHireCost(prev.builders);
      if (prev.resources.GEMS < cost) return prev;
      return { ...prev, resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - cost }, builders: prev.builders + 1 };
    });
    sfx.upgrade();
    spawnText('Builder hired!', window.innerWidth / 2, window.innerHeight / 2, '#4ade80');
    if (gameState.builders < MAX_BUILDERS && gameState.resources.GEMS >= builderHireCost(gameState.builders)) track('builder_hire', { gems: builderHireCost(gameState.builders), builders: gameState.builders + 1 });
  };

  // --- PASSIVE COLLECTORS ---
  const handleCollectResource = (building: BuildingInstance, screenPos: {x: number, y: number}) => {
    const cfg = COLLECTOR_CONFIG[building.type];
    if (!cfg) return;
    const amount = Math.floor(building.accrued || 0);
    if (amount <= 0) return;
    if (protectedAction({ type: 'facility.collect', buildingId: building.id }, receipt => { const gained = (receipt?.gained as Record<string, number> | undefined) ?? {}; const got = Number(gained.COINS ?? gained.FANS ?? amount); const label = gained.FANS !== undefined ? 'Fans' : 'Coins'; spawnText(`+${got} ${label}`, screenPos.x, screenPos.y, '#fbbf24'); if (label === 'Coins') spawnCoinArc(screenPos, got); sfx.collect(); })) return;
    setGameState(prev => ({
      ...prev,
      peakFans: nextFanMilestone(prev, cfg.resource === ResourceType.FANS ? amount : 0),
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
    const preview = rallyPreview(stateRef.current);
    if (!preview.canRally) return;
    if (protectedAction({ type: 'rally' }, () => { centerText(`+${preview.energyGain} Energy · −${preview.fanCost} Fans`, '#f43f5e'); sfx.collect(); })) return;
    setGameState(rallyFans);
    spawnText(`+${preview.energyGain} Energy · −${preview.fanCost} Fans`, window.innerWidth/2, window.innerHeight/2, '#f43f5e');
    sfx.collect();
  };

  // --- RECRUITING ---
  const handleStartRecruit = (candidate: Player, cost: number) => {
    const academy = gameState.buildings.find(b => b.type === BuildingType.YOUTH_ACADEMY);
    if (!academy || gameState.recruitSlot) return;
    if (protectedAction({ type: 'recruit.start', candidateId: candidate.id }, () => { centerText('Scouting…', '#3b82f6'); sfx.scout(); })) return;
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
    setGameState(prev => {
      if (prev.recruitSlot || prev.resources.COINS < cost) return prev; // double-tap: one job, one charge
      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost },
        recruitSlot: { candidate, cost, finishTime: Date.now() + secs * 1000 },
      };
    });
    spawnText('Scouting…', window.innerWidth/2, window.innerHeight/2, '#3b82f6');
    sfx.scout();
  };

  const handleRushRecruit = () => {
    if (protectedAction({ type: 'recruit.rush' })) return;
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
    if (protectedAction({ type: 'recruit.sign' }, receipt => { const signed = stateRef.current.roster.find(p => p.id === receipt?.playerId); centerText(`Signed ${signed?.name ?? 'Player'}!`, '#10b981'); sfx.sign(); })) return;
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
      // Straight into the next season game — no menu. If it can't launch (no energy,
      // season finished), fall back to the Game Day sheet rather than doing nothing.
      case 'campaign': { const next = Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length); if (!startCampaign(next)) setAttackSelectOpen(true); break; }
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
    const unseen = gameState.defenseLog.filter(e => !e.seen).map(e => e.id);
    if (unseen.length && protectedAction({ type: 'defense.seen', ids: unseen.slice(0, 100) })) return;
    if (gameState.defenseLog.some(e => !e.seen)) {
      setGameState(prev => ({ ...prev, defenseLog: prev.defenseLog.map(e => ({ ...e, seen: true })) }));
    }
  };
  const unseenDefenses = gameState.defenseLog.filter(e => !e.seen && !isArchivedAiRaid(e)).length;

  // Open the raid picker with a fresh set of trophy-scaled rivals (no more farming 2 bases).
  // When Live Rivals is connected, also fetch REAL player bases near your trophy count.
  const openRaid = () => {
    preloadCoachArt(); // full portrait set, warmed only now that Game Day is actually open
    if (authority.active) {
      setRaidTargets(authority.roadTargets);
      setLiveTargets(authority.rivals.map(r => ({ pid: r.owner, name: r.name, trophies: r.trophies, layout: [] })));
      void authority.refresh();
    } else {
      setRaidTargets(generateRaidTargets(gameState.trophies));
      setLiveTargets([]);
      if (pvpEnabled()) findOpponents(gameState.trophies).then(setLiveTargets);
    }
    setAttackSelectOpen(true);
    track('raid_open', { trophies: gameState.trophies });
  };

  // Take REVENGE on a rival who raided you — storm their (scaled) base for extra loot.
  const revengeInFlightRef = useRef(false);
  const handleRevenge = async (entry: DefenseLogEntry) => {
    if (isArchivedAiRaid(entry)) return;
    if (revengeInFlightRef.current) return; // double-tap during the base fetch launched (and charged) twice
    revengeInFlightRef.current = true;
    // Was a fixed 4s timer guarding a fetch with a 10s budget: on mobile data the guard
    // self-cleared while the request was still in flight, so the natural second tap
    // launched a SECOND raid and charged 12⚡ twice for one battle. Cleared in a finally
    // instead, so the guard lasts exactly as long as the work does.
    try {
    if (authority.active) {
      if (!entry.attackerPid) { sfx.error(); centerText('Only real rivals can be avenged online', '#94a3b8'); return; }
      if (launchAttack({ mode: 'attack', title: `Revenge — ${entry.attacker}`, buildings: [], loot: { coins: 0, fans: 0 }, pvpTarget: entry.attackerPid }, { kind: 'rival', target: entry.attackerPid })) { track('revenge', { live: true, protected: true }); setDefenseLogOpen(false); }
      return;
    }
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
        const hits = gameState.defenseLog.filter(e => !isArchivedAiRaid(e) && (entry.attackerPid ? e.attackerPid === entry.attackerPid : e.attacker === entry.attacker)).length;
        const feud = hits >= 2 ? 1.5 : 1;
        return { coins: Math.round((Math.round(entry.coinsLost * 1.5) + 200) * feud), fans: Math.round(25 * feud) };
      })(),
      rival: entry.attackerPid ? undefined : coachForBase(entry.attacker), // real people speak for themselves
      pvpTarget,
    });
    if (!launched) return;
    track('revenge', { live: !!entry.attackerPid });
    setGameState(prev => ({ ...prev, defenseLog: prev.defenseLog.map(e => e.id === entry.id ? { ...e, avenged: true } : e) }));
    setDefenseLogOpen(false);
    } finally {
      revengeInFlightRef.current = false;
    }
  };

  // --- BATTLES (real-time raid + base defense) ---
  // Every attack costs Energy — game day isn't free, so loot means something.
  // (Defense scrimmages stay free; you're not choosing to be raided.)
  const launchAttack = (config: BattleConfig, choice?: MatchChoice, confirmed = false): boolean => {
    if (!confirmed) {
      setPreparedPlan('balanced');
      setOpeningHero(config.heroes?.[0]?.key);
      setPreparedMatch({ config: { ...config, squad: gameState.roster }, choice });
      return true;
    }
    if (authority.locked) { sfx.error(); centerText('Sign in as this club\'s owner to play online', '#ef4444'); return false; }
    if (pvpEnabled() && !authority.ready) { authority.setNotice('Connecting your club. Wait for confirmation before reserving a game.'); return false; }
    if (authority.isActiveNow()) {
      // The server issues the match: seed, rules, the rival's defense snapshot and the Energy
      // reservation all come back in one answer. Local Energy is not touched here.
      if (!choice) { sfx.error(); centerText('This game is not available for a protected club', '#94a3b8'); return false; }
      if (authorityMatchRef.current) { sfx.error(); centerText('Finish your current game first', '#ef4444'); return false; }
      centerText('Reserving your game…', '#94a3b8');
      void authority.reserve(choice).then(reserved => {
        if ('error' in reserved) { sfx.error(); centerText(reserved.error, '#ef4444'); authority.setNotice(reserved.error); return; }
        authorityMatchRef.current = { matchId: reserved.matchId, begun: false };
        setBattleConfig({ ...reserved.config, attackerName: reserved.config.attackerName ?? stateRef.current.teamName });
      });
      return true;
    }
    if (gameState.resources.ENERGY < RAID_ENERGY) {
      spawnText(`Squad's gassed — need ⚡${RAID_ENERGY}`, window.innerWidth / 2, window.innerHeight / 2, '#ef4444');
      sfx.error();
      return false;
    }
    setGameState(prev => prev.resources.ENERGY < RAID_ENERGY ? prev // double-fire must not double-charge
      : { ...prev, resources: { ...prev.resources, [ResourceType.ENERGY]: prev.resources.ENERGY - RAID_ENERGY } });
    // Respect an explicit attackerName. The tutorial launches the first game in the same
    // tick it sets the club name, so gameState.teamName is still the stale auto-generated
    // one here — the player would watch their first matchup card show a name they didn't pick.
    setBattleConfig({ ...config, attackerName: config.attackerName ?? gameState.teamName, squad: gameState.roster, preparation: rosterPreparation(gameState.roster,gameState.teamReadiness) }); // your club + your INDIVIDUALS
    return true;
  };

  const startDefense = () => {
    const stadiumLvl = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
    // ONE DEFENSE SNAPSHOT: the same versioned snapshot (layout, emplacement levels, roster
    // boost, mastery, crowd, assigned gate heroes) that rivals attack and the server verifies.
    setBattleConfig({
      mode: 'defense',
      title: 'Defend Your Stadium',
      ...defenseBattleFields(createDefenseSnapshot(gameState)),
      preTroops: defenseAiTroops(),
      aiMult: raidAiMult(65, stadiumLvl), // mid-tier live raider; same tuned curve as offline
      loot: { coins: 0, fans: 0 }, // a SCRIMMAGE — Test Defense must never cost real coins (it was deducting up to 15%+120 even on a hold)
    });
  };

  // 🛡 THE GAUNTLET — preseason challengers storm your house in 5 escalating waves.
  // The mode where the defense you built earns its keep, every day.
  const handleStartGauntlet = () => {
    if (authority.active || authority.locked) { launchAttack({ mode: 'defense', title: 'The Gauntlet', buildings: [], loot: { coins: 0, fans: 0 } }, { kind: 'gauntlet' }); return; }
    if (gameState.gauntlet.attempts <= 0 && gameState.gauntlet.date === todayKey()) { sfx.error(); spawnText('No Gauntlet attempts left today', window.innerWidth / 2, window.innerHeight / 2, '#94a3b8'); return; }
    const tier = Math.min(GAUNTLET_MAX_TIER, gameState.gauntlet.best + 1);
    track('gauntlet_start', { tier });
    setGameState(prev => {
      // Day rolled over mid-session? Refill FIRST, then consume — stamping today on a
      // carried-over attempt used to eat the whole new day's refill. Floor at 0.
      const fresh = prev.gauntlet.date !== todayKey();
      const attempts = Math.max(0, (fresh ? 3 : prev.gauntlet.attempts) - 1);
      return { ...prev, gauntlet: { ...prev.gauntlet, attempts, date: todayKey() } };
    });
    setBattleConfig({
      mode: 'defense',
      title: `The Gauntlet — Night ${tier}`,
      ...defenseBattleFields(createDefenseSnapshot(gameState)),
      gauntlet: { tier, waves: gauntletWaves(tier) },
      loot: { coins: 0, fans: 0 }, // the night pays per wave held, on the whistle
    });
  };

  // ▶ Watch the ACTUAL attack a live rival ran on your base — every deploy is theirs.
  const handleWatchReplay = (entry: DefenseLogEntry) => {
    if (entry.authorityMatchId && !entry.replay) {
      if (!authority.active) { centerText('Sign in as this club\'s owner to watch this film', '#94a3b8'); return; }
      centerText('Fetching the film…', '#94a3b8');
      void authority.film(entry.authorityMatchId).then(film => {
        if (!film || film.v !== 2 || !film.snapshot) { centerText('This film is unavailable or uses unsupported rules', '#94a3b8'); return; }
        setDefenseLogOpen(false);
        setBattleConfig({ ...film.snapshot, replay: { seed: film.seed, script: film.script, planKey: film.plan, version: 2, expectedHash: film.finalHash, expectedTicks: film.ticks, displayTitle: `${entry.attacker.replace(' ⚡', '')} at your stadium` } });
      });
      return;
    }
    const rep = validateReplay(entry.replay);
    if (!rep) {spawnText('This replay is unavailable or uses unsupported rules', window.innerWidth/2,window.innerHeight/2,'#94a3b8');return;}
    if(rep.v === 2 && rep.snapshot) {
      setDefenseLogOpen(false);
      setBattleConfig({...rep.snapshot,replay:{seed:rep.seed,script:rep.script,planKey:rep.plan,version:2,expectedHash:rep.finalHash,expectedTicks:rep.ticks,displayTitle:`${entry.attacker.replace(' ⚡','')} at your stadium`}});
      return;
    }
    setDefenseLogOpen(false);
    setBattleConfig({
      mode: 'attack',
      title: `${entry.attacker.replace(' ⚡', '')} at your stadium`,
      buildings: rep.layout,
      power: rep.power,
      heroes: rep.heroes,
      specials: rep.specials,
      playerArmy: { [UnitGroup.OFFENSE_LINE]: 99, [UnitGroup.OFFENSE_SKILL]: 99, [UnitGroup.DEFENSE_LINE]: 99, [UnitGroup.DEFENSE_SECONDARY]: 99 }, // spectator: never end early on "out of players"
      squad: rep.squad as import('./types').Player[] | undefined, // same named players, same ROLE stats as the live attack
      loot: { coins: 0, fans: 0 },
      replay: { seed: rep.seed, script: rep.script, planKey: rep.plan },
    });
  };

  const handleBattleFinish = (r: BattleResult, destination?: PostBattleDestination) => {
    const ownerAtFinish = playerId();
    const continueJourney = () => {
      if (playerId() !== ownerAtFinish) return;
      if (destination === 'heroes') setIsHeroOpen(true);
      else if (destination === 'defense') setFrontOfficeOpen(true);
      else if (destination === 'games') openRaid();
    };
    if (battleConfig?.authority && authorityMatchRef.current) {
      // Protected club: nothing is credited here. The film goes to the authority, which
      // re-simulates it and answers with the settled club. Rewards appear only when confirmed.
      const open = authorityMatchRef.current;
      authorityMatchRef.current = null;
      setBattleConfig(null);
      if (r.isReplay || r.isPractice) return;
      const film = r.replay;
      if (!film || film.v !== 2 || !film.finalHash || film.ticks === undefined) { authority.setNotice('This game produced no verifiable film, so it cannot be scored.'); sfx.error(); return; }
      authority.setNotice('Confirming your result with the club authority…');
      centerText('Confirming your result…', '#94a3b8');
      track('battle_result', { mode: r.mode, won: r.won, stars: r.stars, pct: r.pct, campaign: !!r.campaignStage, gauntlet: r.gauntletTier !== undefined, live: !!r.pvpTarget, protected: true });
      void authority.finish(open.matchId, { plan: film.plan, script: film.script, ticks: film.ticks, finalHash: film.finalHash }).then(outcome => {
        if (outcome.status === 'confirmed') {
          const battle = (outcome.answer.result as { battleResult?: BattleResult } | null)?.battleResult;
          authority.setNotice(null);
          if (battle) {
            if (battle.mode === 'attack') { centerText(battle.coins > 0 ? `Confirmed: +${battle.coins} coins, +${battle.fans} fans` : 'Confirmed: no loot this drive', battle.coins > 0 ? '#fbbf24' : '#94a3b8'); if (battle.won) bumpLocalRankCelebration(); }
            else centerText(battle.gauntletCleared ? `🛡 NIGHT ${battle.gauntletTier} CLEARED — confirmed` : `Gauntlet confirmed: ${battle.wavesHeld ?? 0} waves held`, '#a855f7');
            (battle.won ? sfx.victory : sfx.defeat)();
          }
          track('battle_confirmed', { mode: battle?.mode, won: !!battle?.won });
          continueJourney();
        } else if (outcome.status === 'failed') { sfx.error(); authority.setNotice(`Result not confirmed: ${outcome.message}`); centerText('Result not confirmed', '#ef4444'); }
        else authority.setNotice(`${outcome.message} Your result will be confirmed when the connection returns.`);
      });
      return;
    }
    if (isNonProgressionBattle(r, battleConfig)) {
      setBattleConfig(null);
      if (r.isPractice || battleConfig?.practice) setIsHeroOpen(true);
      return; // before currencies, counters, progression, analytics, or online reports
    }
    track('battle_result', {
      mode: r.mode,
      won: r.won,
      stars: r.stars,
      pct: r.pct,
      campaign: !!r.campaignStage,
      gauntlet: r.gauntletTier !== undefined,
      live: !!r.pvpTarget,
    });
    if (r.mode === 'attack') {
      // 🎓 Onboarding counter — drives the first-game Game Plan deferral in BattleScreen.
      // Device-local, attack-only, replays already returned above.
      try { const n = (parseInt(localStorage.getItem('fhq_games_played_v1') || '0', 10) || 0) + 1; localStorage.setItem('fhq_games_played_v1', String(n)); } catch { /* ignore */ }
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
          peakFans: nextFanMilestone(prev, r.fans),
          heroes: firstClear
            ? prev.heroes.map(h => h.key === stageDef!.firstClear.shardHero ? { ...h, shards: h.shards + stageDef!.firstClear.shards } : h)
            : prev.heroes,
          campaign,
          matchHistory: [{ week: prev.currentMatch, opponent: r.title.replace('Attacking ', ''), ourScore: r.stars, theirScore: 0, won: r.won, reward: r.coins }, ...prev.matchHistory].slice(0, 50), // capped — this list grew forever and bloated every save + cloud push
          currentMatch: prev.currentMatch + 1,
          trophies: Math.max(0, prev.trophies + trophyDelta),
          teamReadiness: Math.max(0, prev.teamReadiness - 20), // fatigue after taking the field
          shieldUntil: 0, // going on offense drops your protective shield
        };
      });
      if (r.coins > 0) spawnText(`Gate haul +${r.coins} coins!`, window.innerWidth / 2, window.innerHeight / 2, '#fbbf24');
      if (gemReward > 0) spawnText(`+${gemReward} 👑`, window.innerWidth / 2, window.innerHeight / 2 + 40, '#a855f7');
      if (isCampaign && r.won && stageDef && !gameState.campaign.claimed.includes(stage)) spawnText(`First clear! +${stageDef.firstClear.gems} 👑 +${stageDef.firstClear.shards} shards`, window.innerWidth / 2, window.innerHeight / 2 + 40, '#a855f7');
      if (isCampaign && r.won && stageDef && !gameState.campaign.claimed.includes(stage)) track('campaign_first_clear', { stage, stars: r.stars });
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
      if (r.pvpTarget) void reportAttack(r.pvpTarget, gameState.teamName, r.stars, r.pct, r.coins, r.replay).then(report=>setOnlineNotice(report.status === 'reported' ? null : report.message));
      setTimeout(publishMyBase, 500);
    } else if (r.gauntletTier !== undefined) {
      // 🛡 Gauntlet night: pay per wave held; clearing a NEW night banks gems + raises the tier.
      const pay = gauntletReward(r.gauntletTier, r.wavesHeld ?? 0, !!r.gauntletCleared);
      const newBest = !!r.gauntletCleared && r.gauntletTier > gameState.gauntlet.best;
      track('gauntlet_result', { tier: r.gauntletTier, wavesHeld: r.wavesHeld ?? 0, cleared: !!r.gauntletCleared, newBest });
      setGameState(prev => ({
        ...prev,
        resources: {
          ...prev.resources,
          [ResourceType.COINS]: prev.resources.COINS + pay.coins,
          [ResourceType.FANS]: prev.resources.FANS + pay.fans,
          [ResourceType.GEMS]: prev.resources.GEMS + (r.gauntletCleared && r.gauntletTier! > prev.gauntlet.best ? 5 : 0),
        },
        gauntlet: { ...prev.gauntlet, best: r.gauntletCleared ? Math.max(prev.gauntlet.best, r.gauntletTier!) : prev.gauntlet.best },
        peakFans: nextFanMilestone(prev, pay.fans),
      }));
      if (pay.coins > 0) spawnText(`Gauntlet purse +${pay.coins} 🪙 +${pay.fans} fans`, window.innerWidth / 2, window.innerHeight / 2, '#fbbf24');
      if (newBest) spawnText(`🛡 NIGHT ${r.gauntletTier} CLEARED — +5 👑`, window.innerWidth / 2, window.innerHeight / 2 + 40, '#a855f7');
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
    continueJourney();
  };

  // Heroes TRAIN on a timer — much longer than facility builds (3×), because a player
  // getting better is a grind, not a construction job. Doesn't occupy a builder; one
  // training session per hero at a time. (The job loop + gem-rush already understood
  // kind:'hero' jobs — this finally creates them.)
  const bumpLocalRankCelebration = () => { const after = rankFor(stateRef.current.trophies); if (after.index > rankFor(gameState.trophies).index) { centerText(`RANK UP! ${after.rank.emoji} ${after.rank.name.toUpperCase()}`, after.rank.color, -60); } };
  const heroTrainSecs = (toLevel: number) => Math.round(upgradeDurationSecs(toLevel) * 3);
  const handleUpgradeHero = (key: string, cost: number) => {
    if (protectedAction({ type: 'hero.train', heroKey: key }, receipt => { sfx.upgrade(); centerText('Training session started 🏋️', '#facc15'); track('hero_upgrade', { key, toLevel: Number(receipt?.toLevel ?? 0), protected: true }); })) return;
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
      track('hero_upgrade', { key, toLevel: (h0?.level ?? 0) + 1 });
    }
  };

  // --- DAILY PRACTICE (quests) ---
  // Advance a quest's progress if it's on today's slate and unclaimed.
  const bumpDaily = (id: string, n = 1) => {
    if (authorityRef.current.active) return; // the authority advances daily objectives inside each confirmed action
    setGameState(prev => {
      const active = questsForDate(prev.dailies.date).find(q => q.id === id);
      if (!active || prev.dailies.claimed.includes(id)) return prev;
      const cur = prev.dailies.progress[id] || 0;
      if (cur >= active.target) return prev;
      return { ...prev, dailies: { ...prev.dailies, progress: { ...prev.dailies.progress, [id]: Math.min(active.target, cur + n) } } };
    });
  };

  const handleClaimDaily = (id: string) => {
    if (protectedAction({ type: 'daily.claim', questId: id }, () => { sfx.collect(); centerText('Daily reward claimed!', '#f43f5e'); track('daily_claim', { id, protected: true }); })) return;
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
    track('daily_claim', { id });
  };

  const dailyClaimable = questsForDate(gameState.dailies.date)
    .filter(q => (gameState.dailies.progress[q.id] || 0) >= q.target && !gameState.dailies.claimed.includes(q.id)).length;

  // --- LIVE RIVALS (async PvP) ---
  // Defense consequences and their owner-bound cursor persist as one state update.
  const inboxStartedRef = useRef(false);
  useEffect(() => {
    if (!pvpEnabled() || !authority.ready || authority.active || authority.locked || inboxStartedRef.current) return;
    inboxStartedRef.current = true;
    let cancelled=false;
    void (async()=>{
      await getProfile();
      const owner=playerId();
      let cursor=defenseCursor(stateRef.current,owner);
      if(stateRef.current.defenseInbox?.ownerId!==owner) {
        const baseline=await fetchAttackInboxBaseline();
        if(cancelled||baseline.status!=='ok'||baseline.playerId!==owner||playerId()!==owner)return;
        setGameState(previous=>establishDefenseInbox(previous,owner,baseline.cursor));
        cursor=baseline.cursor;
      }
      for(let pageIndex=0;pageIndex<10;pageIndex++) {
        const page=await fetchAttackInbox(cursor);
        if(cancelled||page.status!=='ok'||page.playerId!==owner||playerId()!==owner)return;
        setGameState(previous=>applyAttackInbox(previous,page,owner));
        if(!page.hasMore)return;
        cursor=page.cursor;
      }
    })();
    return ()=>{cancelled=true;};
  },[authority.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Publish my base snapshot so rivals can raid it (on load; also after each battle below).
  // Reads stateRef, NOT the render closure. Every caller schedules this with
  // setTimeout(publishMyBase, 500) from inside the handler that just changed the state,
  // so the timer held that render's function object and published the PRE-change base —
  // no delay can refresh a captured closure. Rivals were raiding a stadium without the
  // turret the player had just bought, against the formation they'd just switched off,
  // with trophies one raid stale (which also skewed matchmaking).
  const publishMyBase = () => {
    if (!pvpEnabled() || cloudSyncPausedRef.current || authorityRef.current.active || authorityRef.current.locked) return;
    const s = stateRef.current;
    publishBase(s.teamName, s.trophies, layoutFromFixedBase(s.buildings, s.roster, s.defenseSlots, s.parkingLot, s.formation, s.formationMastery[s.formation] ?? 0));
    track('base_publish', { trophies: s.trophies });
  };
  useEffect(() => { if (authority.ready && !authority.active) publishMyBase(); }, [authority.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // One session_start per load — the denominator for every retention/funnel metric.
  useEffect(() => {
    track('session_start', { trophies: gameState.trophies, returning: localStorage.getItem(TUTORIAL_KEY) === '1', ...trafficSource() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SCOUT SEARCH (hero gacha): spend gems, get a new hero or shards toward a star-up.
  const handleRollHero = () => {
    if (gameState.resources.GEMS < ROLL_COST_GEMS) { sfx.error(); return; }
    if (protectedAction({ type: 'hero.scout' }, receipt => { const roll = receipt?.roll as RollResult | undefined; if (roll) { setLastRoll(roll); if (roll.isNew) sfx.victory(); else sfx.sign(); track('scout_search', { isNew: roll.isNew, key: roll.key, shards: roll.shards ?? 0, protected: true }); } })) return;
    const res = rollHero(gameState.heroes);
    setGameState(prev => {
      if (prev.resources.GEMS < ROLL_COST_GEMS) return prev; // double-tap must never drive gems negative
      return {
        ...prev,
        resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - ROLL_COST_GEMS },
        heroes: prev.heroes.map(h => h.key === res.key
          ? (res.isNew ? { ...h, unlocked: true } : { ...h, shards: h.shards + res.shards })
          : h),
      };
    });
    setLastRoll(res);
    bumpDaily('scout');
    if (res.isNew) sfx.victory(); else sfx.sign();
    track('scout_search', { isNew: res.isNew, key: res.key, shards: res.shards ?? 0 });
  };

  // Star-up: spend a hero's banked shards for a big evolution power spike.
  const handleStarUpHero = (key: string) => {
    if (protectedAction({ type: 'hero.star', heroKey: key }, () => { sfx.upgrade(); centerText('⭐ STAR UP!', '#fde047'); })) return;
    setGameState(prev => {
      const hero = prev.heroes.find(h => h.key === key);
      if (!hero || !hero.unlocked || hero.stars >= MAX_STARS) return prev;
      const cost = STAR_UP_COSTS[hero.stars];
      if (!cost || hero.shards < cost) { sfx.error(); return prev; }
      return { ...prev, heroes: prev.heroes.map(h => h.key === key ? { ...h, stars: h.stars + 1, shards: h.shards - cost } : h) };
    });
    sfx.upgrade();
    spawnText('⭐ STAR UP!', window.innerWidth / 2, window.innerHeight / 2, '#fde047');
    track('hero_starup', { key });
  };

  // Launch a Season campaign stage (deterministic ladder — the PvE spine).
  // Returns whether the game actually started, so the tutorial can fall back to the
  // GAME DAY panel instead of stranding a brand-new coach on an empty field.
  const startCampaign = (stage: number, attackerName?: string): boolean => {
    const st = CAMPAIGN_STAGES[stage - 1];
    if (!st || stage > gameState.campaign.unlocked) { sfx.error(); return false; }
    const base = campaignBase(stage);
    const launched = launchAttack({
      attackerName, // the tutorial passes the just-typed club name; gameState is stale in that tick
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
    }, { kind: 'campaign', stage });
    if (launched) { setAttackSelectOpen(false); track('campaign_start', { stage }); }
    return launched;
  };

  // Unlock a hero by paying its coin/gem cost.
  const handleUnlockHero = (key: string) => {
    const def = HERO_DEFS.find(d => d.key === key);
    if (!def || !def.unlock) return;
    if (protectedAction({ type: 'hero.unlock', heroKey: key }, () => { sfx.sign(); centerText(`${def.name} unlocked!`, '#a855f7'); })) return;
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
    if (protectedAction({ type: 'defense.buy-slot' }, () => { sfx.upgrade(); centerText('+1 equipment slot!', '#a855f7'); })) return;
    setGameState(prev => {
      if (prev.bonusDefSlots >= EXTRA_SLOT_COSTS.length) return prev;
      const cost = EXTRA_SLOT_COSTS[prev.bonusDefSlots];
      if (prev.resources.GEMS < cost) { sfx.error(); return prev; }
      return { ...prev, resources: { ...prev.resources, [ResourceType.GEMS]: prev.resources.GEMS - cost }, bonusDefSlots: prev.bonusDefSlots + 1 };
    });
    const ok = gameState.bonusDefSlots < EXTRA_SLOT_COSTS.length && gameState.resources.GEMS >= EXTRA_SLOT_COSTS[gameState.bonusDefSlots];
    if (ok) { sfx.upgrade(); spawnText('+1 equipment slot!', window.innerWidth / 2, window.innerHeight / 2, '#a855f7'); track('slot_buy', { gems: EXTRA_SLOT_COSTS[gameState.bonusDefSlots], slot: gameState.bonusDefSlots + 1 }); }
  };

  // ✂️ CUT a player — frees a roster spot so you can scout better talent.
  // Floor of 6: you can't cut your way below a fieldable squad.
  const handleCutPlayer = (id: string) => {
    if (protectedAction({ type: 'recruit.cut', playerId: id }, () => { sfx.click(); centerText('Released to free agency ✂️', '#94a3b8'); })) return;
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
    return (
      <div className="mt-2 flex justify-center w-full">
        <img
          src={`/assets/formations/${f}.webp`}
          alt={f}
          draggable={false}
          onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
          className="w-[70px] h-[70px] object-contain drop-shadow-md"
        />
      </div>
    );
  };

  // 📋 CALL A FORMATION — free to switch; slot levels carry, only geometry moves.
  const handleSetFormation = (key: FormationKey) => {
    if (!formationUnlocked(key, stadiumLevel)) { sfx.error(); return; }
    if (key === gameState.formation) return;
    if (protectedAction({ type: 'formation.set', formation: key }, () => { sfx.whoosh(); centerText(`${formationDef(key).name} — new scheme called! 📋`, '#38bdf8'); })) return;
    setGameState(prev => ({
      ...prev,
      formation: key,
      campusLayout: undefined,
      buildings: prev.buildings.map(b => { const a = anchorsFor(key)[b.type]; return a ? { ...b, gridX: a.gridX, gridY: a.gridY } : b; }),
    }));
    sfx.whoosh(); // buildings glide to their new anchors
    spawnText(`${formationDef(key).name} — new scheme called! 📋`, window.innerWidth / 2, window.innerHeight / 2, '#38bdf8');
    setTimeout(publishMyBase, 500);
  };

  // ⭐ Assign a hero to a gate post (one gate per hero — reassigning moves them).
  const handleAssignHeroGate = (postId: string, heroKey: string) => {
    if (protectedAction({ type: 'gate.assign', postId, heroKey }, () => sfx.click())) return;
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
    if (protectedAction({ type: 'defense.upgrade-slot', slotId }, () => { sfx.upgrade(); centerText(cur === 0 ? `${t.name} installed!` : `${t.name} → L${toLevel}!`, '#4ade80'); })) return;
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
    if (protectedAction({ type: 'parking.upgrade' }, () => { sfx.upgrade(); centerText('🅿️ Parking Lot paved — longer approach for raiders!', '#4ade80'); })) return;
    setGameState(prev => {
      if (prev.parkingLot >= PARKING_LOT.maxLevel) return prev;
      const cost = PARKING_LOT.costs[prev.parkingLot];
      if (prev.resources.COINS < cost) { sfx.error(); return prev; }
      return { ...prev, resources: { ...prev.resources, [ResourceType.COINS]: prev.resources.COINS - cost }, parkingLot: prev.parkingLot + 1 };
    });
    const affordable = gameState.parkingLot < PARKING_LOT.maxLevel && gameState.resources.COINS >= PARKING_LOT.costs[gameState.parkingLot];
    if (affordable) { sfx.upgrade(); spawnText('🅿️ Parking Lot paved — longer approach for raiders!', window.innerWidth / 2, window.innerHeight / 2, '#4ade80'); setTimeout(publishMyBase, 500); track('parking_lot_pave', { coins: PARKING_LOT.costs[gameState.parkingLot], toLevel: gameState.parkingLot + 1 }); }
  };

  const handleResetGame = () => {
      if (authority.active || authority.locked) { setConfirmingReset(false); centerText('A protected club lives on the server and cannot be reset here', '#94a3b8'); return; }
      // Last-chance local backup — for a linked club the 60s trickle would otherwise
      // push the empty franchise over the cloud copy with nothing to recover from.
      try { const cur = localStorage.getItem(SAVE_KEY); if (cur) localStorage.setItem('fhq_backup_prereset', cur); } catch { /* best effort */ }
      try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(TUTORIAL_KEY); } catch (e) { /* ignore */ }
      setGameState(createInitialState());

      setSelectedBuilding(null);
      setConfirmingReset(false);
      setShowTutorial(true);
      spawnText("New Franchise!", window.innerWidth/2, window.innerHeight/2, '#fbbf24');
  };

  const stadiumLevel = gameState.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;

  const saveCampusDraft = async (layout: CampusLayout) => {
    if (authority.locked || !authority.ready || authority.pendingCount > 0) return {ok:false,message:'Wait for your club to connect and confirm pending operations in Settings.'};
    const stadium = stateRef.current.buildings.find(b=>b.type===BuildingType.STADIUM)?.level ?? 1;
    if (!formationUnlocked(layout.formation, stadium)) return {ok:false,message:'This formation is not unlocked yet.'};
    if (authority.active) {
      const outcome = await authority.dispatch({type:'campus.apply',layout});
      if(outcome.status==='confirmed') return {ok:true,message:'Layout confirmed online. Your campus and defense now use these positions.'};
      authority.setNotice(outcome.message);
      return {ok:false,message:outcome.message};
    }
    setGameState(previous=>applyCampusLayout(previous,layout));
    return {ok:true,message:'Layout applied. Your campus and defense tests now use these positions.'};
  };

  return (
    <div className="fhq-game relative w-full h-screen bg-slate-900 overflow-hidden font-sans select-none">
      {showTutorial && <TutorialOverlay initialName={gameState.teamName} onRerollName={genTeamName} onDone={finishTutorial} />}

      <TopHUD onOpenClub={() => setDashboardOpen(true)} gameState={gameState} onRally={handleRally} onOpenRanks={() => { setStandingsTab('ladder'); setIsStandingsOpen(true); }} />

      <IsometricMap
        customLayout={!!gameState.campusLayout}
        onEditCampus={() => {setSelectedBuilding(null);setCampusEditorOpen(true);}}
        heroes={gameState.heroes}
        onOpenHeroes={key => { setFocusedHero(key); setIsHeroOpen(true); }}
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
        growthFans={fanMilestoneTotal(gameState)}
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
          <img src="/assets/icons/coins.webp" alt="" draggable={false} className="w-5 h-5 select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
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
        return (
          <div data-ccbar className="fixed left-0 right-0 z-40 flex flex-col items-center gap-1.5 pointer-events-none animate-fade-in" style={{ bottom: 96 }}>
            <div className="font-display font-black text-white text-xl sm:text-2xl uppercase tracking-tight text-center px-3" style={{ textShadow: '0 2px 6px #000, 0 0 14px rgba(0,0,0,0.8)' }}>
              {info.name} <span className="text-yellow-300">(Level {b.level})</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-mono font-bold" style={{ textShadow: '0 1px 4px #000' }}>
              {busy ? <span className="text-amber-300">🔨 upgrading…</span>
                : gated ? <span className="text-slate-300">🔒 needs Stadium L{b.level + 1}</span>
                : <><img src="/assets/icons/coins.webp" alt="" className="w-4 h-4" draggable={false} /><span className={canAfford ? 'text-yellow-300' : 'text-red-400'}>{cost.toLocaleString()}</span></>}
            </div>
            <div className="flex items-end gap-2 mt-1">
              <CCBtn label="Info" emoji="💬" onClick={() => setBuildingInfoOpen(true)} />
              <CCBtn label="Level Up" emoji="🔨" accent disabled={busy || gated || !canAfford} onClick={() => setBuildingInfoOpen(true)} />
              {isStadium && <CCBtn label="Defense" emoji="🛡️" onClick={() => { setSelectedBuilding(null); setFrontOfficeOpen(true); }} />}
              {b.type === BuildingType.TACTICS_ROOM && <CCBtn label="Game Day" emoji="🏈" onClick={() => { setSelectedBuilding(null); setAttackSelectOpen(true); }} />}
            </div>
            {!busy && <p className="max-w-sm rounded-lg bg-slate-950/95 px-3 py-2 text-center text-xs text-slate-200">{buildingEffect(b.type, b.level).label}: {buildingEffect(b.type, b.level).value} → {buildingEffect(b.type, b.level + 1).value}</p>}
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

      {campusEditorOpen && <Suspense fallback={<div role="status" className="fixed inset-0 z-50 bg-slate-950 text-white p-8">Opening campus editor…</div>}><CampusEditor state={gameState} blocked={authority.locked || !authority.ready || authority.pendingCount > 0} onApply={saveCampusDraft} onClose={()=>setCampusEditorOpen(false)} onTest={()=>{setCampusEditorOpen(false);startDefense();}} /></Suspense>}
      {/* 🏙 Club Dashboard — SimCity advisor panel, opened from the jumbotron */}
      {dashboardOpen && <ClubDashboard gs={gameState} onClose={() => setDashboardOpen(false)} onRoster={() => { setDashboardOpen(false); setIsSquadOpen(true); }} onGameDay={() => { setDashboardOpen(false); openRaid(); }} onDefense={() => { setDashboardOpen(false); setFrontOfficeOpen(true); }} />}

      {/* Attack: Season campaign ladder or a live Raid */}
      {attackSelectOpen && (
        <Sheet
          title={<>Game Day <span className="text-[12px] font-sans font-bold normal-case tracking-normal text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5" title="Suiting up costs Energy — regen at the Rehab Center">⚡{RAID_ENERGY} per game</span></>}
          icon={<span className="text-[22px] leading-none">🏈</span>}
          onClose={() => setAttackSelectOpen(false)}
          maxWidth="max-w-md"
        >
          <div className="p-5 pt-3 flex flex-col max-h-full">
            <div className="fhq-game-day-art">
              <img src="/assets/gpt/game-day-tunnel.png" alt="Three players head through the tunnel toward the field" width="1536" height="1024" decoding="async" />
              <div><span>{attackTab === 'season' ? `Season · Stage ${Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length)}` : 'Away games'}</span><strong>{attackTab === 'season' ? CAMPAIGN_STAGES[Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length) - 1].name : 'Take their house'}</strong></div>
            </div>
            {/* Mode tabs */}
            <div className="flex gap-2 mb-2">
              <button onClick={() => setAttackTab('season')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${attackTab === 'season' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                🏆 Season {(gameState.campaign.stars[CAMPAIGN_STAGES.length] ?? 0) > 0 ? '✓' : `${Math.min(gameState.campaign.unlocked, CAMPAIGN_STAGES.length)}/${CAMPAIGN_STAGES.length}`}
              </button>
              <button onClick={() => setAttackTab('raid')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${attackTab === 'raid' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                🏈 Away games
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
            {/* 🛡 THE GAUNTLET — the nightly defense event; your gear earns its keep */}
            {(() => {
              const g = gameState.gauntlet;
              const night = Math.min(GAUNTLET_MAX_TIER, g.best + 1);
              const preview = gauntletReward(night, 5, true);
              return (
                <button onClick={() => { if (g.attempts <= 0) { sfx.error(); return; } setAttackSelectOpen(false); handleStartGauntlet(); }}
                  className={`relative w-full mb-3 rounded-2xl p-[2px] text-left transition-all active:scale-[0.98] ${g.attempts > 0 ? '' : 'opacity-60'}`}
                  style={{ background: 'linear-gradient(115deg, #7c2d12, #f97316 45%, #fde047 55%, #f97316 65%, #7c2d12)' }}>
                  <span className="flex items-center gap-3 rounded-[14px] bg-[#131b2b] px-4 py-3">
                    <span className="text-3xl drop-shadow" aria-hidden>🛡</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-black uppercase tracking-wide text-white text-[15px] leading-tight">The Gauntlet <span className="text-orange-300">— Night {night}</span></span>
                      <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">5 waves storm YOUR house. Call the defense. Hold the line.</span>
                      <span className="block text-[10px] font-bold text-yellow-300/90 mt-1">Clear pays ~{preview.coins.toLocaleString()}🪙 · +{preview.fans} fans{g.best < night ? ' · first clear +5👑' : ''}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-[17px] font-black leading-none ${g.attempts > 0 ? 'text-green-400' : 'text-slate-500'}`}>{g.attempts}/3</span>
                      <span className="block text-[9px] uppercase font-bold text-slate-500 mt-0.5">tonight</span>
                      {g.best > 0 && <span className="block text-[9px] font-bold text-orange-300 mt-1">best: Night {g.best}</span>}
                    </span>
                  </span>
                </button>
              );
            })()}
            <div className="mb-3">
              <HowTo id="gameday" lines={[
                'SEASON: beat 12 rival coaches for the ring — earn up to 3 game balls per matchup.',
                'RAID: hit rival bases for Coins and Fans. ⚡ Live Rivals are real coaches — beating them takes trophies.',
                `Every game costs ⚡${RAID_ENERGY} Energy. In battle: drop players near a lane, then direct the drive with plays and hero abilities.`,
                'DEFENSE LOG shows who raided you while you were away — watch the film and take revenge.',
                'THE GAUNTLET: 5 escalating waves attack YOUR base — free to run, 3 tries a night. Hold the house to clear the night and unlock the next. Your emplacement levels, mastery plays, and mascot do the fighting.',
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
                    <button key={b.pid} onClick={() => { if (launchAttack({ mode: 'attack', title: `Raiding ${b.name}`, buildings: b.layout, playerArmy: armyFromRoster(gameState.roster), power: raidPower(), heroes: heroesForBattle(gameState.heroes), specials: specialsForBattle(gameState.resources.FANS), loot: { coins: 500 + b.trophies * 3, fans: 25 }, pvpTarget: b.pid }, { kind: 'rival', target: b.pid })) setAttackSelectOpen(false); }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-fuchsia-700/70 hover:border-fuchsia-400 bg-fuchsia-950/30 hover:bg-fuchsia-900/30 transition-all active:scale-95 text-left">
                      <div>
                        <div className="font-bold text-white text-lg">⚡ {b.name}</div>
                        <div className="text-xs text-fuchsia-200/70">🏆 {b.trophies} · {b.layout.length ? `${b.layout.filter(x => x.kind !== 'wall').length} buildings · live player` : 'protected club · defense revealed at kickoff'}{(() => { const f = b.layout.find(x => x.kind === 'hq')?.formation; return f && FORMATIONS[f as FormationKey] ? <span className="text-sky-300 font-bold"> · 📋 {FORMATIONS[f as FormationKey].name}</span> : null; })()}</div>
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
              {/* Was: "not connected — raid real players by wiring Supabase (see PVP-SETUP.md)".
                  That is a developer instruction, and it was shipping to real players. */}
              {!pvpEnabled() && (
                <div className="text-[11px] text-slate-500 border border-slate-800 rounded-lg px-3 py-2">🌐 <span className="text-slate-400 font-bold">Live Rivals</span> — raiding real coaches' stadiums is coming soon.</div>
              )}
              {raidTargets.map((b, choice) => (
                <button key={b.id} onClick={() => { if (launchAttack({ mode: 'attack', title: `Attacking ${b.name}`, buildings: b.buildings, playerArmy: armyFromRoster(gameState.roster), power: raidPower(), heroes: heroesForBattle(gameState.heroes), specials: specialsForBattle(gameState.resources.FANS), loot: b.reward, rival: coachForBase(b.name) }, { kind: 'road', choice })) setAttackSelectOpen(false); }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-slate-700 hover:border-red-500 bg-slate-800 hover:bg-slate-700/70 transition-all active:scale-95 text-left">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={crestForTeam(b.name)} alt="" draggable={false}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      className="w-9 h-9 object-contain shrink-0 select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
                  <div>
                    <div className="font-bold text-white text-lg">{b.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      {Array.from({ length: Math.max(1, Math.min(5, Math.round(b.difficulty))) }).map((_, i) => <span key={i} className="text-[11px] leading-none inline-block">🏈</span>)}
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

      {preparedMatch && <MatchPreparation config={preparedMatch.config} energy={gameState.resources.ENERGY} cost={RAID_ENERGY}
        plan={preparedPlan} onPlan={setPreparedPlan} openingHero={openingHero} onHero={setOpeningHero} onClose={() => setPreparedMatch(null)}
        onStart={() => { if (launchAttack(preparedMatch.config, preparedMatch.choice, true)) setPreparedMatch(null); }} />}
      {battleConfig && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col items-center justify-center gap-4" role="status"><img src="/assets/brand/logo.webp" alt="Football Headquarters" width="240" /><p>Getting the field ready…</p></div>}><BattleScreen
          key={battleConfig.practice ? `practice-${practiceTake}` : 'match'}
          config={battleConfig}
          initialPlan={battleConfig.practice ? 'balanced' : preparedPlan}
          openingHero={battleConfig.practice ? undefined : openingHero}
          onFinish={handleBattleFinish}
          onKickoff={() => {
            const open = authorityMatchRef.current;
            if (!open || open.begun || !battleConfig.authority) return;
            open.begun = true;
            void authority.begin(open.matchId).then(r => { if (!r.ok) { authority.setNotice(`This game will not count: ${r.message}`); centerText('This game will not count', '#ef4444'); } });
          }}
          onPracticeAgain={() => { setPracticeTake(take => take + 1); setBattleConfig(heroPracticeConfig(battleConfig.heroes?.[0]?.key ?? 'qb')); }}
          onExit={(beforeKickoff) => {
            if (battleConfig.authority && authorityMatchRef.current) {
              // The server releases the reservation; Energy comes back only if play never started.
              const open = authorityMatchRef.current; authorityMatchRef.current = null;
              void authority.cancel(open.matchId).then(ok => { if (!ok) authority.setNotice('The reserved game could not be released yet. It will be released on your next load.'); });
              track('battle_abandon', { mode: battleConfig?.mode, campaign: !!battleConfig?.campaignStage, protected: true });
              setBattleConfig(null);
              return;
            }
            // Energy is charged in launchAttack, before the battle mounts. Backing out of
            // the deploy screen used to eat it silently — no game, no loot, no refund, and
            // no analytics event, so the drop-off was invisible in the funnel too.
            if (canRefundRaidEnergy(beforeKickoff, battleConfig)) {
              setGameState(prev => ({ ...prev, resources: { ...prev.resources, [ResourceType.ENERGY]: Math.min(100, prev.resources.ENERGY + RAID_ENERGY) } }));
              track('battle_abandon', { mode: battleConfig?.mode, campaign: !!battleConfig?.campaignStage });
            }
            setBattleConfig(null);
            if (battleConfig.practice) setIsHeroOpen(true);
          }}
        /></Suspense>
      )}

      {isHeroOpen && (
        <Suspense fallback={<Sheet title="Hall of Heroes" icon={<span>🏈</span>} onClose={() => setIsHeroOpen(false)}><p className="p-5 text-slate-300" role="status">Opening the film room…</p></Sheet>}>
        <HeroModal
          initialHero={focusedHero}
          onPractice={key => { setFocusedHero(key); setIsHeroOpen(false); setBattleConfig(heroPracticeConfig(key)); }}
          heroes={gameState.heroes}
          upgrades={gameState.upgrades}
          blocked={authority.locked || !authority.ready || authority.pendingCount > 0}
          resources={gameState.resources}
          stadiumLevel={stadiumLevel}
          lastRoll={lastRoll}
          onClose={() => { setIsHeroOpen(false); setLastRoll(null); }}
          onUpgrade={handleUpgradeHero}
          onUnlock={handleUnlockHero}
          onRoll={handleRollHero}
          onStarUp={handleStarUpHero}
        /></Suspense>
      )}

      {defenseLogOpen && (
        <DefenseLogModal
          log={gameState.defenseLog}
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
            board={authority.active ? (gameState.recruitBoard?.candidates ?? []) : undefined}
            onRefreshBoard={() => { protectedAction({ type: 'recruit.refresh' }); }}
          />
        );
      })()}

      {/* Live objective + readiness banner + arrow pointing at the next thing to tap */}
      {!frontOfficeOpen && <ObjectiveBanner gameState={gameState} onGoal={handleGoal} dailyClaimable={dailyClaimable} onOpenDailies={() => setIsDailyOpen(true)} />}
      <TourPointer
        gameState={gameState}
        active={!frontOfficeOpen && !(isSquadOpen || isScoutingOpen || isStandingsOpen || !!selectedBuilding || confirmingReset || showTutorial
          || defenseLogOpen || isHeroOpen || isDailyOpen || attackSelectOpen || settingsOpen || !!preparedMatch || !!battleConfig)}
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
                'Pick a FORMATION template, then level its emplacements. Edit campus on the home field customizes their positions.',
                'Install and level emplacements with Coins. Higher Stadium levels unlock more slots.',
                'Walls and the Team Bus grow with your Stadium. Their positions can be changed in Edit campus.',
                'Tap 🧪 Test Defense to watch your setup fight off a raid.',
                'Mastery ★s pay off LIVE: each ★ adds a 📣 Crowd Noise charge, ★★ adds a 🛡 Goal-Line charge, ★★★ unlocks 🧊 TIMEOUT.',
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
                          <div className="text-[10px] leading-none mt-1" title={`Formation mastery — hold your stadium (0 game balls allowed) while running this scheme. Each ★: +3% defense AND +1 📣 Crowd Noise. ★★ adds a 🛡 Goal-Line charge. ★★★ unlocks 🧊 TIMEOUT (ice the whole drive).`}>
                            {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < lvl ? 1 : 0.25, filter: i < lvl ? 'none' : 'grayscale(1)' }}>⭐</span>)}
                            {lvl > 0 && <span className="ml-1 text-green-400 font-bold">+{lvl * 3}%</span>}
                            {lvl > 0 && <span className="ml-1 text-orange-300 font-bold">+{lvl}📣{lvl >= 2 ? ` +${lvl - 1}🛡` : ''}{lvl >= 3 ? ' 🧊' : ''}</span>}
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
                        {/* current-tier art (emoji shows until it loads) */}
                        <span className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                          <span className="text-xl">{t.emoji}</span>
                          <img src={defenseSprite(slot.kind, Math.max(1, lvl))} alt="" draggable={false}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            className="absolute inset-0 w-full h-full object-contain" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">
                            {t.name} {lvl > 0 && <span className="text-yellow-300">L{lvl}</span>}
                            {lvl > 1 && <span className="text-[10px] text-green-400 font-mono ml-1.5">+{Math.round((slotHpMult(lvl) - 1) * 100)}% Grit · +{Math.round((slotDmgMult(lvl) - 1) * 100)}% yards</span>}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{slot.covers} · {t.desc}</div>
                          {/* 🛣 THE ROAD TO LEVELS — the gear itself visibly upgrades at L4 and L8 */}
                          {unlocked && lvl > 0 && (
                            <div className="flex items-center gap-1 mt-1.5">
                              {DEFENSE_ART_GATES.map((gate, ti) => {
                                const reached = lvl >= gate;
                                return (
                                  <React.Fragment key={gate}>
                                    {ti > 0 && <span className={`text-[10px] ${reached ? 'text-orange-400' : 'text-slate-600'}`}>›</span>}
                                    <span className={`relative w-9 h-9 rounded-lg border flex items-center justify-center overflow-visible ${reached ? 'border-orange-500/70 bg-slate-900/70' : 'border-slate-700 bg-slate-900/40'}`}>
                                      <img src={defenseSprite(slot.kind, gate)} alt="" draggable={false}
                                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                        className="w-full h-full object-contain" style={{ filter: reached ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' : 'grayscale(1) brightness(0.55)' }} />
                                      <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1 rounded text-[8px] font-black leading-tight ${reached ? 'bg-orange-500 text-black' : 'bg-slate-800 text-slate-400'}`}>L{gate}</span>
                                    </span>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}
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
                <div className="text-[12px] text-slate-300"><b>🛑 Perimeter:</b> {walls.length} Blocking Sleds at {wallHpFor(stadiumLevel)} Grit — hardens automatically with your Stadium (L{stadiumLevel}).</div>
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
        aria-label="Settings"
      >
        <span className="relative flex">
          <SettingsIcon size={16} />
          {!hasExported && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" title="Back up your club — your save only lives in this browser" />}
        </span>
      </button>

      {settingsOpen && (
        <div className="relative z-[70]">
          <Sheet title="Settings" maxWidth="max-w-sm" onClose={() => setSettingsOpen(false)}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div><div className="text-sm font-bold text-white">{gameState.teamName}</div><div className="text-[11px] text-slate-500">your club</div></div>
                <span className="text-2xl">🏈</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">Sound</div>
                <button onClick={() => setMuted(toggleMute())} aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted} className={`min-h-11 px-3 py-1.5 rounded-lg border text-sm font-bold flex items-center gap-2 transition-colors ${muted ? 'border-slate-700 text-slate-400' : 'border-orange-500 text-orange-300 bg-orange-900/20'}`}>
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}{muted ? 'Muted' : 'On'}
                </button>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <div className="text-sm text-slate-300 mb-0.5">Back up your club</div>
                <div className="text-[11px] text-slate-500 mb-2">Export a copy of your progress. Sign in on a new device to reconnect your online club; passwords and sessions are never included in a backup.</div>
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
                        <button onClick={async () => { pauseCloudSync(false);setCloudMsg('Syncing…'); const r = await syncWithCloud(); setCloudMsg(r === 'conflict' ? 'Another device changed this club. Choose which progress to keep below.' : r === 'pushed' ? 'Club saved to the cloud ✓' : r === 'error' || r === 'none' ? "Couldn't reach the cloud — your club is safe on this device. We'll retry." : null); }}
                          className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors active:scale-95">☁️ Sync now</button>
                        <button onClick={() => { setCloudConflict(undefined); signOutToGuest(); setProfile(null); setCloudMsg('Signed out — this device plays as a new guest.'); void authority.resync(); }}
                          className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold transition-colors active:scale-95">Sign out</button>
                      </div>
                      <button onClick={async () => {
                        if (cloudMsg !== 'Delete cloud data? Tap again to confirm.') { setCloudMsg('Delete cloud data? Tap again to confirm.'); return; }
                        const ok = await deleteCloudData();
                        if(ok){pauseCloudSync(true);setCloudConflict(undefined);}
                        setCloudMsg(ok ? 'Cloud save and published base deleted. Cloud sync is paused; tap Sync to resume. Your club remains on this device.' : 'Delete failed — try again.');
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
                          pauseCloudSync(false);setCloudConflict(undefined);setCloudMsg('Creating your account…');
                          const r = await linkAccount(email, pass);
                          if (!r.ok) { setCloudMsg(r.error ?? 'Could not create the account.'); return; }
                          const p = await getProfile(); setProfile(p);
                          void authority.resync();
                          const pushed = await pushSaveToCloud();
                          setCloudMsg(p?.email
                            ? (pushed ? 'Account created — club saved to the cloud ✓' : 'Account created ✓ — cloud sync will start on the next connection.')
                            : `Account created — confirm via the link we emailed to ${p?.pendingEmail ?? email} to enable sign-in on other devices.`);
                        }} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors active:scale-95">Create account</button>
                        <button onClick={async () => {
                          const email = (document.getElementById('fhq-auth-email') as HTMLInputElement | null)?.value.trim() ?? '';
                          const pass = (document.getElementById('fhq-auth-pass') as HTMLInputElement | null)?.value ?? '';
                          if (!email.includes('@') || !pass) { setCloudMsg('Enter your email and password.'); return; }
                          pauseCloudSync(false);setCloudConflict(undefined);setCloudMsg('Signing in…');
                          const r = await signInWithPassword(email, pass);
                          if (!r.ok) { setCloudMsg(r.error ?? 'Sign-in failed.'); return; }
                          const p = await getProfile(); setProfile(p);
                          setCloudMsg('Signed in — loading your club…');
                          await authority.resync(); // a protected club on this account wins over any cloud save
                          if (authorityRef.current.isActiveNow()) { setCloudMsg('Signed in — your protected club is loaded.'); return; }
                          // On success this reloads into the cloud club. On a failed lookup it now
                          // backs off instead of pushing this device's save over the real one.
                          const sync = await syncWithCloud(true); // fresh device: the cloud club wins (local backed up first)
                          if (sync === 'error') setCloudMsg("Signed in, but we couldn't load your club just yet — check your connection and tap Sync. Your saved club has not been overwritten.");
                        }} className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold transition-colors active:scale-95">Sign in</button>
                      </div>
                    </>
                  )}
                  {cloudConflict !== undefined && cloudConflict.ownerId===playerId() && <div className="mt-3 rounded-xl border border-amber-500 p-3 text-sm" role="alert">
                    <p className="font-bold text-amber-200">Choose the progress to keep</p>
                    <p className="mt-1 text-slate-300">{cloudConflict.save ? `Cloud: ${cloudConflict.save.club_name ?? 'Saved club'}. Device: ${gameState.teamName}. Both versions are preserved until you choose.` : 'The cloud club was removed on another device. Your device’s club is still saved here.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cloudConflict.save && <Btn onClick={()=>void resolveCloudConflict('cloud')}>Use cloud club</Btn>}
                      <Btn onClick={()=>void resolveCloudConflict('device')}>Keep this device’s club</Btn>
                      <Btn onClick={()=>{setCloudConflict(undefined);setCloudMsg('Both clubs preserved. Cloud uploads are paused until you resolve the conflict.');}}>Decide later</Btn>
                    </div>
                  </div>}
                  {onlineNotice && <p role="status" className="mt-3 text-sm text-amber-200">{onlineNotice}</p>}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <div className="text-sm text-slate-300 mb-0.5 flex items-center justify-between">
                      <span>🛡 Online protection</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${authority.active ? 'bg-emerald-700 text-white' : authority.locked ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>{!authority.ready ? 'checking…' : authority.active ? 'protected' : authority.locked ? 'locked' : 'off'}</span>
                    </div>
                    {authority.active ? (
                      <>
                        <div className="text-[11px] text-slate-500 mb-2">Every upgrade, recruit and game is confirmed by the club server before it counts. Revision {authority.revision}{authority.pendingCount > 0 ? ` · ${authority.pendingCount} change${authority.pendingCount === 1 ? '' : 's'} awaiting confirmation` : ' · everything confirmed'}.</div>
                        <div className="flex gap-2">
                          <button onClick={() => { void authority.retry().then(() => authority.refresh()); }} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors active:scale-95">{authority.pendingCount > 0 ? '↻ Retry pending' : '↻ Refresh club'}</button>
                          {authority.match && <button onClick={() => { const id = authority.match!.id; void authority.cancel(id).then(ok => authority.setNotice(ok ? 'The open game was released.' : 'The open game could not be released yet.')); }} className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-bold transition-colors active:scale-95">Release open game</button>}
                        </div>
                      </>
                    ) : authority.locked ? (
                      <div className="text-[11px] text-amber-200">This device holds a protected club for another account. Sign in as its owner to continue it; this copy cannot be changed.</div>
                    ) : (
                      <>
                        <div className="text-[11px] text-slate-500 mb-2">Move this club to the server so rewards, upgrades and rival games are confirmed and cannot be lost or forged. Once protected, only other protected clubs appear as live rivals.</div>
                        <button disabled={!authority.ready} onClick={async () => {
                          authority.setNotice('Connecting your club…');
                          try { localStorage.setItem('fhq_backup_preprotect', JSON.stringify(stateRef.current)); } catch { /* best effort */ }
                          const r = await authority.enable(stateRef.current);
                          authority.setNotice(r.message);
                          if (r.ok) { pauseCloudSync(true); void unpublishBase(); track('authority_enable', { origin: 'settings' }); }
                        }} className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition-colors active:scale-95">🛡 Protect this club online</button>
                      </>
                    )}
                    {authority.notice && <p role="status" className="mt-2 text-[11px] text-amber-200">{authority.notice}</p>}
                    {(authority.active || authority.locked) && (() => {
                      const diag = authority.diagnostics();
                      const recent = diag.events.filter(e => e.outcome !== 'query').slice(-5).reverse();
                      const needsSignIn = diag.availability.status === 'unauthorized' || recent.some(e => e.code === 'unauthorized');
                      return (
                        <details className="mt-2 text-[11px] text-slate-400">
                          <summary className="cursor-pointer text-slate-300">Connection details · {diag.availability.status === 'ok' ? 'club server reachable' : diag.availability.status === 'unknown' ? 'not checked yet' : `club server ${diag.availability.status}`}{diag.averageConfirmLatencyMs != null ? ` · ~${diag.averageConfirmLatencyMs} ms to confirm` : ''}</summary>
                          <div className="mt-1">{diag.confirmed} confirmed · {diag.pending} pending · {diag.failed} refused on this device</div>
                          {needsSignIn && <div className="mt-1 text-amber-200">Your session expired. Sign in above to confirm pending changes.</div>}
                          <ul className="mt-1 space-y-0.5">{recent.map((e, i) => <li key={i} className="font-mono">{new Date(e.at).toLocaleTimeString()} · {e.kind}{e.operationId ? ` #${e.operationId}` : ''} · {e.outcome}{e.code ? ` (${e.code})` : ''}{e.latencyMs != null ? ` · ${e.latencyMs} ms` : ''}</li>)}</ul>
                        </details>
                      );
                    })()}
                  </div>
                  {pendingAttackReports().map(report=><p key={report.operationId} className="mt-2 text-xs text-slate-400">{report.message}</p>)}
                  {cloudSyncPaused && <p className="mt-2 text-sm text-amber-200">Cloud sync is paused. Tap Sync when you want to upload this club again.</p>}
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
          </Sheet>
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

      <GameNavigation
        rosterOpen={isSquadOpen} heroesOpen={isHeroOpen} defenseOpen={frontOfficeOpen}
        ranksOpen={isStandingsOpen} unseenDefenses={unseenDefenses}
        onRoster={() => setIsSquadOpen(true)} onHeroes={() => {setFocusedHero('qb');setIsHeroOpen(true);}}
        onGameDay={openRaid} onRanks={() => setIsStandingsOpen(true)}
        onDefense={() => { setFrontOfficeOpen(true); setSelectedBuilding(null); }}
      />
    </div>
  );
}

export default App;
