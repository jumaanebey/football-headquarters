# Return and progression integration

Owned changes are in place. App.tsx was not modified by this task. Apply these semantic edits while preserving concurrent App changes, existing free-practice side-effect guards and movement.

```diff
--- a/App.tsx
+++ b/App.tsx
@@ -17,7 +17,7 @@
   return null;
 };
 import { GameState, ResourceType, BuildingInstance, BuildingType, DrillState, FloatingText, PlayerState, UnitGroup, Player, UpgradeJob, DefenseLogEntry } from './types';
-import { DRILLS, RECRUIT_CONFIG, COLLECTOR_CONFIG, RALLY_CONFIG, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, trainingYieldMult, warRoomReadinessMult, OPPONENTS, DEFENSE_TYPES, RAID_ENERGY, PARKING_LOT, EXTRA_SLOT_COSTS, BUILDING_INFO, UPGRADE_CONFIG } from './constants';
+import { DRILLS, RECRUIT_CONFIG, COLLECTOR_CONFIG, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, trainingYieldMult, warRoomReadinessMult, OPPONENTS, DEFENSE_TYPES, RAID_ENERGY, PARKING_LOT, EXTRA_SLOT_COSTS, BUILDING_INFO, UPGRADE_CONFIG } from './constants';
 import { rosterCap, recruitSeconds } from './recruiting';
 import { sfx, toggleMute, isMuted } from './sound';
 import { IsometricMap } from './components/IsometricMap';
@@ -54,6 +54,8 @@
 import { loadState, SAVE_KEY, TUTORIAL_KEY, parseSavedClub } from './game/persistence';
 import { layoutFromFixedBase } from './game/defenseLayout';
 import { advanceCampus } from './game/campus';
+import { fanMilestoneTotal, nextFanMilestone, rallyFans, rallyPreview } from './game/fanProgress';
+import { isArchivedAiRaid } from './game/defenseHistory';
 import { useUpgradeCelebrations } from './game/useUpgradeCelebrations';
 import { Sheet, Btn, HowTo } from './components/ui';
 import { armyFromRoster, armyStrength, heroesForBattle, HERO_DEFS, heroMaxLevel, defenseAiTroops, specialsForBattle, raidAiMult, makeRevengeBase, homeDefenders, gauntletWaves, gauntletReward, GAUNTLET_MAX_TIER } from './battle';
@@ -507,6 +509,7 @@
     if (amount <= 0) return;
     setGameState(prev => ({
       ...prev,
+      peakFans: nextFanMilestone(prev, cfg.resource === ResourceType.FANS ? amount : 0),
       resources: { ...prev.resources, [cfg.resource]: prev.resources[cfg.resource] + amount },
       buildings: prev.buildings.map(b => b.id === building.id ? { ...b, accrued: 0 } : b)
     }));
@@ -518,18 +521,10 @@
   };
 
   const handleRally = () => {
-    setGameState(prev => {
-      if (prev.resources.ENERGY >= 100 || prev.resources.FANS < RALLY_CONFIG.fanCost) return prev;
-      return {
-        ...prev,
-        resources: {
-          ...prev.resources,
-          [ResourceType.FANS]: prev.resources.FANS - RALLY_CONFIG.fanCost,
-          [ResourceType.ENERGY]: Math.min(100, prev.resources.ENERGY + RALLY_CONFIG.energyGain),
-        }
-      };
-    });
-    spawnText('Fans fired up! +Energy', window.innerWidth/2, window.innerHeight/2, '#f43f5e');
+    const preview = rallyPreview(stateRef.current);
+    if (!preview.canRally) return;
+    setGameState(rallyFans);
+    spawnText(`+${preview.energyGain} Energy · −${preview.fanCost} Fans`, window.innerWidth/2, window.innerHeight/2, '#f43f5e');
     sfx.collect();
   };
 
@@ -614,7 +609,7 @@
       setGameState(prev => ({ ...prev, defenseLog: prev.defenseLog.map(e => ({ ...e, seen: true })) }));
     }
   };
-  const unseenDefenses = gameState.defenseLog.filter(e => !e.seen).length;
+  const unseenDefenses = gameState.defenseLog.filter(e => !e.seen && !isArchivedAiRaid(e)).length;
 
   // Open the raid picker with a fresh set of trophy-scaled rivals (no more farming 2 bases).
   // When Live Rivals is connected, also fetch REAL player bases near your trophy count.
@@ -630,6 +625,7 @@
   // Take REVENGE on a rival who raided you — storm their (scaled) base for extra loot.
   const revengeInFlightRef = useRef(false);
   const handleRevenge = async (entry: DefenseLogEntry) => {
+    if (isArchivedAiRaid(entry)) return;
     if (revengeInFlightRef.current) return; // double-tap during the base fetch launched (and charged) twice
     revengeInFlightRef.current = true;
     // Was a fixed 4s timer guarding a fetch with a 10s budget: on mobile data the guard
@@ -664,7 +660,7 @@
       specials: specialsForBattle(gameState.resources.FANS),
       // 🔥 FEUD: a rival who's hit you 2+ times pays extra when you finally hit back.
       loot: (() => {
-        const hits = gameState.defenseLog.filter(e => (entry.attackerPid ? e.attackerPid === entry.attackerPid : e.attacker === entry.attacker)).length;
+        const hits = gameState.defenseLog.filter(e => !isArchivedAiRaid(e) && (entry.attackerPid ? e.attackerPid === entry.attackerPid : e.attacker === entry.attacker)).length;
         const feud = hits >= 2 ? 1.5 : 1;
         return { coins: Math.round((Math.round(entry.coinsLost * 1.5) + 200) * feud), fans: Math.round(25 * feud) };
       })(),
@@ -821,6 +817,7 @@
             [ResourceType.FANS]: prev.resources.FANS + r.fans,
             [ResourceType.GEMS]: prev.resources.GEMS + gemReward + (firstClear ? stageDef!.firstClear.gems : 0),
           },
+          peakFans: nextFanMilestone(prev, r.fans),
           heroes: firstClear
             ? prev.heroes.map(h => h.key === stageDef!.firstClear.shardHero ? { ...h, shards: h.shards + stageDef!.firstClear.shards } : h)
             : prev.heroes,
@@ -864,6 +861,7 @@
           [ResourceType.GEMS]: prev.resources.GEMS + (r.gauntletCleared && r.gauntletTier! > prev.gauntlet.best ? 5 : 0),
         },
         gauntlet: { ...prev.gauntlet, best: r.gauntletCleared ? Math.max(prev.gauntlet.best, r.gauntletTier!) : prev.gauntlet.best },
+        peakFans: nextFanMilestone(prev, pay.fans),
       }));
       if (pay.coins > 0) spawnText(`Gauntlet purse +${pay.coins} 🪙 +${pay.fans} fans`, window.innerWidth / 2, window.innerHeight / 2, '#fbbf24');
       if (newBest) spawnText(`🛡 NIGHT ${r.gauntletTier} CLEARED — +5 👑`, window.innerWidth / 2, window.innerHeight / 2 + 40, '#a855f7');
@@ -1222,6 +1220,7 @@
         clubName={gameState.teamName}
         trophies={gameState.trophies}
         fans={Math.floor(gameState.resources[ResourceType.FANS] ?? 0)}
+        growthFans={fanMilestoneTotal(gameState)}
         selectedId={selectedBuilding?.id ?? null}
         celebrationId={celebration?.id ?? null}
         onDeselect={() => { setSelectedBuilding(null); setBuildingInfoOpen(false); }}
@@ -1529,7 +1528,6 @@
       {defenseLogOpen && (
         <DefenseLogModal
           log={gameState.defenseLog}
-          shieldUntil={gameState.shieldUntil}
           onClose={() => setDefenseLogOpen(false)}
           onWatchLive={() => { setDefenseLogOpen(false); startDefense(); }}
           onRevenge={handleRevenge}
```

## Verification

- Prepared regression suite passed: 19 tests in tests/returnExperience.test.ts.
- Additional boundary coverage and final type checking are recorded below when complete.
- Browser acceptance remains pending: exact rally preview, Escape/cancel, costs and resulting balances, focus restoration; earned campus decor after rally/reopen; archived history labels and no revenge actions.

## Explicit limits

- peakFans means largest known available balance, not lifetime cumulative Fans. Legacy spent Fans cannot be reconstructed.
- Return timing is local elapsed time. Server authority and cross-device conflict handling are separate work.
- Existing archived losses and balances are preserved without invented reimbursement.
- Ordinary reopens complete upgrades and drills; a new dedicated away-summary animation is not added.
- The rally button remains available at full Energy or insufficient Fans so costs/status are discoverable and dialog focus can return to a persistent opener.
- Archived generated history is excluded from dashboard/log summaries; App patch also excludes it from unseen badges, feud counts and direct revenge entry.

## Rush integration — additional correction

Import `finishUpgradeNow` from `./game/upgrades`. Replace `handleFinishNow` with this handler, or equivalent event feedback around the pure transition. Remove `skipGemCost` from the App constants import if it becomes unused. This handles elapsed time before a purchased level change and does not charge a rush fee for a naturally completed job.

```tsx
  const handleFinishNow = (jobId: string) => {
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
```

Verification after this correction: `npm test -- tests/returnExperience.test.ts tests/campus.test.ts tests/persistence.test.ts` passed **40 tests in three files**. This includes 24 return-experience regressions. The existing campus storage assertion now requires the upgraded capacity after an upgrade completes during the absence.

Final integration type check: `npm run typecheck` passed after the App edits were applied by the root task. Browser and production gates remain separate from these automated results.
