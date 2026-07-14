# Football HQ — Session Recap (for Fable, tomorrow)

_Written by Opus 4.8 at the end of a session where the subagent fleet got
rate-limited and the shell went flaky. Read this before touching anything._

---

## TL;DR — the one thing that matters

**The big "engineering backlog" (5 P0 · 5 P1 · 4 P2 · 12 P3 · 9 CI guardrails) was
reverse-engineered from an OLD shipped bundle (`index-Cg9V-UMp.js`). The current
source at HEAD already implements almost all of it.** Do NOT re-run a fleet to
"fix" P0/P1 — you'd redo or *regress* carefully-tuned, comment-documented code.

I verified this by reading the actual source (`battle.ts`, `constants.ts`,
`pvp.ts`, `App.tsx`, `IsometricMap.tsx`, `assets.ts`, `BattleScreen.tsx`).

---

## Branch / git state

- Working branch: **`overhaul/backlog`** (base = `2df598b`, the last shipped prod commit).
- New commit on it: **`7e87a90`** — "4 more enemy base templates (P2-2) + combat guardrail tests". **NOT pushed.**
- `git stash@{0}` holds partial edits from the killed agents + two new files
  (`iso.ts`, `resultRules.ts`). **DO NOT land these** (see "Do NOT" below).
- Older handoff (the July-3 diagnosis, now largely superseded): `~/Desktop/football-hq-handoff.md`.

---

## What I actually changed (committed in 7e87a90)

1. **`battle.ts` — P2-2 done.** `ENEMY_BASES` went 2 → 6 (`valley, tech, harbor,
   summit, delta, ridge`), each with distinct wall shape / turret placement /
   building count. `generateRaidTargets` cycles `ENEMY_BASES[i % len]`, so raids
   no longer repeat valley/tech/valley. `generateRaidTargets` still rescales
   hp/damage per trophy tier and overrides the hq formation; `makeRevengeBase`
   still uses `ENEMY_BASES[1]` — both untouched by the additions.
2. **`battle.test.ts` — NEW guardrail suite.** Locks in the already-shipped fixes:
   rarity→combat, role table, A* pathfinding, the >700-trophy crash, honest
   result (0 attackers → 0 stars/0 reward), + a P2-2 template assertion.

**Verification status:** both are **`tsc`-clean** (I confirmed no errors in these
two files; the project's overall `tsc` exits 2 with ~hundreds of PRE-EXISTING
errors — normal, FHQ ships via `vite build`/esbuild, not tsc).
**The tests were NOT executed** — vitest would not run in my shell (see gotchas).
⚠️ **First job tomorrow: actually run them.**

---

## Reconciled backlog — real status vs. source

| Ticket | Status in current source |
|---|---|
| P0-1 rarity→combat | ✅ Done (`effectiveStat`/`unitCombatStats`, `RARITY_MULT`×`ROLE_BASE_STATS`×level) |
| P0-2 trophy tiers / >700 crash | ✅ Done (crash comment at `battle.ts:~433`; trophies drive `generateRaidTargets`) |
| P0-3/P0-4 fake coaches / seeded log | ✅ Done (procedural `RIVAL_NAMES`, no "real coaches" claim) |
| P0-5 honest results | ✅ Done (damage-weighted pct + star model in `simulateRaid`) |
| P1-1 pathfinding (no teleport) | ✅ Done (A* `planPath`, wall-aware) |
| P1-2 role table | ✅ Done (`ROLE_COMBAT` thrower/receiver/protector, live + offline sim) |
| P1-3/P1-4 tendencies / schemes | ✅ Done (`GAME_PLANS`, bot formations, tendency bonuses) |
| **P2-2 enemy bases** | ✅ **Done this session** (2→6) |
| P2-1 async PvP | ✅ Already real (`pvp.ts`: publish base, matchmake, report attack, RLS) |
| P2-3 coach identities | ❔ Not verified — `campaign.ts` unread. Possibly real. |
| P3-0/1/4/9/10 | ✅ Done (one `tileToScreen`; field fixed; composite scoreboard; diamond boundary; walls via A*) |
| P3-2/3 depth-scale | ⚠️ MOOT — would regress the hand-tuned `?edit=1` layout. Don't. |
| P3-6 wrong-sport sprite | ✅ Done (`assets.ts:5-11` all football; no court sprite) |
| P3-7/P3-8 floating #s / VFX layering | ✅ Substantially done (unified iso z-index `(x+y)/2`; documented VFX fixes). Exact floating-number *cap* not pinned. |
| **P3-5 tree variants** | 🟢 OPEN — all `tree-cluster` share one slug (`IsometricMap.tsx:507-521`) |
| **P3-11 floodlight/vehicle/flag polish** | 🟢 OPEN — 4 floodlights clustered on one edge (`IsometricMap.tsx:503-506`) |

---

## Recommended plan for tomorrow (small!)

1. **Verify the safety net:** `npx vitest run battle.test.ts` then `npm run build`
   (`vite build`). Fix any red assertions (likely just a threshold tweak).
2. **If you want more raid variety live:** nothing needed — P2-2 already ships it.
3. **The only genuinely-open work is cosmetic and needs a human/art call:**
   - **P3-5 trees:** needs new art slugs (`tree-oak/pine/bush`) OR, art-free, add
     seeded random flip + slight scale/rotation jitter to the existing
     `tree-cluster` entries to break the uniformity. Low risk.
   - **P3-11 floodlights/vehicles:** redistributing them means editing coords in
     `OUTER_DECOR`, which is **Jumaane's verbatim `?edit=1` export** — get his
     sign-off first, or do it in the editor and re-export. Don't silently override.
4. **Optionally** verify **P2-3** by reading `campaign.ts` (coaches' formations +
   quip pools) — only real open gameplay item I didn't confirm.

---

## Do NOT

- ❌ Re-run a "fix P0/P1" agent fleet — it's already done; you'll regress tuned code.
- ❌ Land `iso.ts` from the stash — its depth-scale would rescale every hand-placed
  prop and break Jumaane's July-11 layout.
- ❌ Land `resultRules.ts` from the stash — its star thresholds (0.34/0.66/1.0)
  CONFLICT with the shipped model (50% / HQ-dead / 99% in `simulateRaid`).
- ❌ Override the `?edit=1` hand-tuned layout coords without Jumaane's OK.
- ❌ Trust `battle.test.ts` as green until you've actually run it.

---

## Architecture health (asked + answered this session)

All clean, none are problems: JSON saves are small + size-capped + gzip'd in
transit; DB writes are idempotent upserts w/ RLS + rate-limit; no single hard
dependency (cloud is optional, every fetch has a 10s timeout); rendering is
local-first optimistic; site is static (Vite→Vercel CDN). Autosave cadence
confirmed healthy: local every 2s, cloud throttled to 1/min for linked accounts,
flushed on `beforeunload`+`pagehide`.

---

## Environment gotchas (this session's shell was degraded — may or may not persist)

- **`grep`/`rg` HANG** on big files (`assets.ts` is 5500+ lines w/ huge lines).
  Use the **Read tool**, not shell grep. If you must grep, redirect to a file and
  Read it — but even that hung here.
- **`vitest` produced ZERO output** across 3 invocations (`npx`, piped, direct
  binary + stdin closed). Likely this shell, not the tests. Try a fresh terminal.
- **`tsc --noEmit`** works but dumps ~361KB of pre-existing errors; grep the log
  for `^battle.ts(` etc. to isolate YOUR files.
- Background-command + Read-the-output-file pattern is the most reliable here.
- Root cause suspicion: a runaway 5GB output file earlier in the session may have
  left the shell's process/output handling degraded. A new session likely resets it.

---

## Key file map

- `App.tsx` (2151) — state, game loop, save/load, cloud sync (`syncWithCloud`, autosave `:470`)
- `battle.ts` (now ~930) — combat math, sim, pathfinding, `ENEMY_BASES`, `generateRaidTargets`
- `battle.test.ts` — guardrail tests (NEW, unrun)
- `constants.ts` (465) — balance tables, `RARITY_MULT`, `ROLE_BASE_STATS`, tendencies, `VOXEL_CONFIG`
- `pvp.ts` (301) — Supabase auth, async PvP, cloud saves (all graceful-no-op offline)
- `components/BattleScreen.tsx` (1925) — battle UI, FX (`Fx` type `:69`), unit/building render + z-index
- `components/IsometricMap.tsx` (1436) — home board, `tileToScreen` `:49`, `OUTER_DECOR` `:498`, `?edit=1` editor `:523`
- `assets.ts` (5526) — sprite registry, `buildingSprite` `:27`, `BUILDING_ART` `:5`
- `campaign.ts` (668) — coaches/stages (UNREAD — check for P2-3)
- `fixedBase.ts` (326) — defense formations/slot geometry
