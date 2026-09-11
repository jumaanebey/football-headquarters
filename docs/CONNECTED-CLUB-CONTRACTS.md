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

## Package B — two-possession Stadium — **in progress**

Reserved names, to be filled in as the package lands: `game/stadiumFootball.ts` keeps its current
exports (`STADIUM_OPPONENTS`, `footballCalls`, `applyStadiumFootball`, `validStadiumFootball`) and
gains event geometry (possession side, direction, start/end yard line, scoring type), a persisted
receiving order, situational objective text and per-matchup attribution drawn from the lineup
snapshot. `components/StadiumFootball.tsx` and `components/StadiumSequence.tsx` keep their current
props; any addition will be listed here before it is required.

## Package C — development and scouting — **not started**

Will be documented here with before/after fixtures for every economic change.
