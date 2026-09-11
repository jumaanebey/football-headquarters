# Connected club — integration contracts

The boundary between Claude's rules packages and Codex's presentation. Everything here is a
pure read model or a typed authority action: no component in this document renders anything, and
no rule in it persists through a route other than the existing authority pipeline.

Branch `claude/fhq-connected-club` from main `4f6357d`. Status of each section is stated at its
head. Codex's roster UI should consume these exports rather than shipping local-only controls.

---

## Package A — active lineup and reserves — **available now**

### Module `game/lineup.ts`

```ts
// Shape
type LineupSlotId = 'QB' | 'BACK' | 'RECEIVER' | 'LINE1' | 'LINE2' | 'RUSHER' | 'BACKER' | 'COVER' | 'SAFETY';
type LineupSide = 'offense' | 'defense';
type LineupAssignment = Partial<Record<LineupSlotId, string>>;   // slot -> player id
interface LineupState { version: number; slots: LineupAssignment; updatedAt: number }   // GameState.lineup

interface LineupSlotDef { id; label; side; unit: UnitGroup; preferredRole: PlayerRole; fallback: UnitGroup[]; contributes: ('attack'|'defense'|'speed'|'power'|'iq')[] }
const LINEUP_SLOTS: readonly LineupSlotDef[];      // nine starters, ordered for display
const LINEUP_SLOT_IDS: readonly LineupSlotId[];
function lineupSlot(id: string): LineupSlotDef | undefined;

// Read models
interface LineupCandidate { playerId; name; role; unit; power; outOfPosition; selectedElsewhere: LineupSlotId | null }
interface LineupSlotView  { slot; label; side; unit; preferredRole; contributes; playerId: string|null; player: Player|null; outOfPosition: boolean; candidates: LineupCandidate[] }
interface LineupRatings   { attack; defense; speed; power; iq }
interface LineupBlocker   { code: 'unfilled'|'unknown-player'|'duplicate-player'|'out-of-position'|'empty-roster'; slot?; playerId?; message: string }
interface LineupView      { slots: LineupSlotView[]; reserves: LineupCandidate[]; ratings: LineupRatings; valid: boolean; blockers: LineupBlocker[]; filled: number; total: number }

function lineupOf(club: Pick<GameState,'roster'|'lineup'>): LineupAssignment;          // stored, or a deterministic selection
function lineupView(club, assignment?): LineupView;                                     // everything the roster screen needs
function compareLineupChange(club, slot: LineupSlotId, playerId: string | null, base?): LineupComparison;
interface LineupComparison { slot; incoming; outgoing; before: LineupRatings; after: LineupRatings; delta: LineupRatings; assignment: LineupAssignment; valid: boolean; blockers: LineupBlocker[] }

// Rules used by preview and settlement alike
function lineupRatings(roster, assignment): LineupRatings;
function lineupBlockers(roster, assignment): LineupBlocker[];
function lineupValid(roster, assignment): boolean;
function selectLineup(roster, keep?): LineupAssignment;                                 // deterministic legal team
function repairLineup(roster, assignment): { slots: LineupAssignment; repaired: LineupSlotId[] };
function slotFit(slot, player): 0 | 1 | 2 | 3;  function isEligible(slot, player): boolean;

// Persistence helpers
function parseLineupAssignment(input: unknown): LineupAssignment | null;
function validLineup(input: unknown): input is LineupState;
interface LineupSnapshot { slots: LineupAssignment; players: { id; name; role; unit; power }[] }
function lineupSnapshot(club, assignment?): LineupSnapshot;
function snapshotSlotPlayer(snapshot, slot): LineupSnapshot['players'][number] | null;
```

**Slots.** Nine starters: three offensive skill (QB, BACK, RECEIVER), two offensive line
(LINE1, LINE2), two front seven (RUSHER, BACKER) and two secondary (COVER, SAFETY). The ten-player
starting roster therefore fields a legal team with one reserve, and every unit group matters.

**A club is never made unplayable by a missing position.** Each slot names the unit it is written
for and a fallback order over the other three. A player filling a slot from another unit is
accepted and reported as `outOfPosition` — a note for the UI, not a refusal.

**Ratings come only from selected players.** Offensive slots produce `attack`, defensive slots
`defense`, and `speed`/`power`/`iq` are the means over the selected nine. Signing a reserve cannot
change them. Replacing a starter changes them by exactly `LineupComparison.delta`, because the
preview and the settlement call the same `lineupRatings`.

**Determinism.** `selectLineup` fills the scarcest slots first, prefers the named role, then the
stronger player, then the lower id. The roster array is never reordered or filtered; a lineup is
only a set of ids pointing into it.

### Authority action

```ts
{ type: 'lineup.set'; lineup: LineupAssignment }     // e.g. { QB: 'p_12', BACK: 'p_31', … }
```

Sent through the existing pipeline (`useAuthority().dispatch(action)` for protected clubs, the
same reducer locally). No alternate persistence route exists. The reducer refuses unknown or
duplicated player ids, ids absent from the roster, assignments naming a slot that does not exist,
and payloads with extra keys. On success the result carries:

```ts
{ type: 'lineup.set'; slots: LineupAssignment; ratings: LineupRatings; repaired: LineupSlotId[] }
```

**Codex call sites** (Claude does not edit these files):

```tsx
// SquadModal — the roster screen
import { lineupView, compareLineupChange, type LineupSlotId } from '../game/lineup';
const view = lineupView(gameState);                       // slots, candidates, reserves, ratings, blockers
const preview = compareLineupChange(gameState, slot, candidate.playerId);
//   preview.delta.attack === +4  →  "Attack 58 → 62"
onConfirm={() => protectedAction({ type: 'lineup.set', lineup: preview.assignment })}
```

`lineupView(...).blockers` is the single source for "your lineup needs attention"; when a cut
empties a slot the reducer repairs it deterministically and returns `repaired`, so the UI can name
the slots that changed rather than silently showing a different team.

---

## Package B — two-possession Stadium — **available now**

### Module `game/stadiumFootball.ts`

Existing exports are unchanged in name and signature: `STADIUM_OPPONENTS`, `footballCalls(game)`,
`footballRatings(club)`, `applyStadiumFootball`, `validStadiumFootball`, `footballInProgress`,
`FOOTBALL_ENTRY_ENERGY`, and the `StadiumAction` union. `footballRatings` now reads the selected
lineup instead of the whole roster.

```ts
const STADIUM_RULES_VERSION = 2;
type Possession = 'home' | 'away';
type ReturnCoverage = 'edges' | 'middle' | 'balanced';
type DefensiveLook = 'blitz' | 'deep' | 'balanced';
type FootballActionKind = 'return'|'kick'|'pass'|'run'|'field-goal'|'conversion'|'stop'|'touchdown'|'concede';
interface FootballActor { slot: LineupSlotId; name: string; role: PlayerRole; attribute: 'speed'|'power'|'iq'|'overall'; value: number }

// FootballEvent gains (all optional; absent on pre-rewrite events)
interface FootballEvent { …; possession?; direction?: 1|-1; startYard?: number; endYard?: number; action?: FootballActionKind; scored?: number; actors?: FootballActor[] }
// StadiumFootballGame gains
interface StadiumFootballGame { …; v?: number; possession?; possessionIndex?: number; receivesFirst?: Possession; seed?: number; lineup?: LineupSnapshot }

isTwoPossessionGame(game): boolean          // false for a pre-rewrite game, which keeps the frozen legacy rules
stadiumObjective(game): string              // "A field goal ties; a touchdown wins." — derived from the score
returnCoverageOf(game): ReturnCoverage;  coverageDescription(c): string
defensiveLookOf(game): DefensiveLook;    lookDescription(l): string
conversionMatters(game): boolean            // false when no conversion result can change win, tie or loss
yardsToGoal(possession, yardLine): number;  fieldGoalDistance(possession, yardLine): number
driveDirection(possession): 1 | -1;         describeYard(yardLine): string   // "your 35" / "their 22" / "midfield"
kickerOf(game): LineupSnapshot['players'][number] | null
```

**The field is one 0–100 scale.** Yard 0 is the home endzone line, 100 the away endzone line;
the home club attacks 100 (`direction` +1), the opponent attacks 0 (−1). Every event records the
yard line it started and ended on, so presentation renders the drive rather than inferring it.

**Every call answers something shown.** Return coverage and the defensive look are derived from
the game's stored `seed`, so a reload shows the same situation, and each option's `detail` says
whether it answers that look. A balanced look is the only case where the lanes are equal, and the
copy says so.

**Conversions are skipped when they cannot matter**, and a go-ahead touchdown on the second
possession that puts the result beyond any conversion ends the game immediately. Ties stand.

### Components (props unchanged)

`<StadiumFootball club blocked onAction />` and `<StadiumSequence game level />` keep their exact
signatures — `components/CampusDepartment.tsx` needs no edit. Stadium styles live in
`components/stadium.css`, imported by `StadiumFootball.tsx`, so `game-theme.css` is untouched.

**Nothing is required of Codex for Package B.** If the roster screen wants to show the pending
Stadium situation elsewhere, `stadiumObjective(game)` and `coverageDescription(returnCoverageOf(game))`
are the two strings to use.

## Package C — development and scouting — **not started**

Deferred deliberately so Packages A, B and D could land as one coherent integration, as the
handoff allows. It will arrive as a separate additive PR and will be documented here with
before/after fixtures for every economic change.
