# POLISH PLAN — close every loop before anything new ships

Status date: 2026-07-05 (v2 — expanded after "this is all too rushed" review).
Rule in effect: **feature freeze**. Everything below perfects what already exists.
Parked until this plan is done: clans, replay sharing, purchasable land, music,
club rename, new units/heroes/buildings.

---

## v2 — THE BLIND SPOTS (what a feature audit misses)

### D1. There is no UI design system
The interface is accreted, not designed: ad-hoc font sizes (8–11px micro-text
everywhere), six different button styles, border radii from `lg` to `3xl`, spacing off
any grid, and a mix of THREE icon languages (emoji, lucide icons, PNG icons) that render
differently per platform. Semantic color is inconsistent (fuchsia=live, purple=gems,
rose=fans, blue=defense, orange=brand… assigned by whim). Every modal has a slightly
different header/close/padding anatomy.
**Fix:** one tokens pass — a type scale (4 sizes), one button anatomy (3 variants), one
modal shell, a semantic color map, 4-pt spacing — then sweep every screen through it.

### D2. The team identity isn't IN the game's look
We defined black `#111827` + orange `#f97316` as the club's identity… and the UI chrome
is generic slate-blue, while the home BUILDINGS are blue/teal Kickoff-Club art. Your own
base doesn't look like your team. The brand lives in a doc, not on the screen.
**Fix (code side now, art side with Antigravity later):** UI chrome adopts the
black/orange identity (nav, HUD, buttons); building-accent recolor becomes the next art
round (home buildings in team colors — same silhouettes).

### D3. Fiction coherence — coach fantasy vs clash logic
Why do my wide receivers demolish a weight room? De-weaponizing helped, but the core
loop is still clash-logic wearing football clothes, and the copy flickers between
fantasies (coach? owner? raider?). One deliberate fiction pass over ALL copy:
raids = "away games", destruction = "outscoring/outplaying", loot = "gate revenue &
poached fans". The DESIGN-BIBLE has the vocabulary; the game only half-uses it.

### D4. Too many meters, no mental model
Coins, Crowns, Energy, Fans, Trophies, XP, Readiness, Shards — 8 numbers before a new
player understands one. XP/level is literally dead. Readiness is a hidden binary.
**Fix within freeze:** kill or fold the dead meter (XP), make each remaining number
teach itself (one-line tooltip everywhere a number appears), and audit the FTUE so
meters are introduced one at a time.

### D5. Accessibility floor is below floor
Red-vs-green is the ONLY signal on the funnel lanes (classic colorblind fail) — needs a
shape/pattern difference. 8–9px text is common. Zero keyboard support, zero
reduced-motion respect, constant pulsing animations. Minimum pass: pattern-differentiate
the lanes, raise micro-text to a floor, honor `prefers-reduced-motion`.

### D6. Data safety — players can silently lose everything
localStorage is the ONLY save, and the PvP identity lives there too. One cleared
browser = whole club gone, unrecoverable. Before any real audience: an export/import
save button (Settings), and surface it in the UI. (This is protection of an existing
asset, not a feature.)

### D7. No crash safety, no tests
One render error = blank screen (it has happened — isSeasonOpen). No error boundary.
Zero automated tests; every regression check is a hand-rolled browser script. Minimum:
a React error boundary with a "reload, your save is safe" screen, and a small vitest
suite locking the pure logic (planPath, homeDefenders, gacha odds, defense rating,
wall/slot caps, footprint math) so refactors like 12×12 can't silently break math.

### D8. Navigation & IA gaps
No profile/settings surface: Reset sits naked next to Mute in the corner (dangerous
placement), mute/rename/export have no home, and nowhere shows your club's own story
(record, trophies over time, championship ring). Fold Reset/Mute/Export into a small
Settings sheet; the profile view is PARKED (it's a feature) — but Reset placement is a
today problem.

### D9. Process — how we keep from rushing
- Every loop ships with: behavior verified + docs updated + one line added to
  QA-CHECKLIST.md (a living script replayed on-device before calling a phase done).
- New ideas go to the PARKED list by default; only P0/P1 fixes jump the queue.
- Rating rubric: we define what a "7/10" looks like in writing BEFORE Phase D ends,
  so "is it right yet?" has an answer that isn't vibes.

---

## The expansion decision (12×12, standard — not purchasable)

**10×10 is objectively too small now.** The math: 5 buildings × 4 tiles = 20, walls up to
38, equipment up to 8, bus 1 → **up to 67 of 100 tiles occupied** at Stadium L11. There is
no room to *design*, only to cram. Clash-likes run ~20-30% occupancy; we're at 67%.

**Decision: 12×12 as the standard board for everyone** (144 tiles → same content = ~47%,
breathing room without emptiness). Purchasable land can come LATER as an outer-ring
unlock on top of this — that's a cheap flag once 12×12 exists. Key facts that make this
safe: the battle world is fixed 0–100 and published PvP layouts are stored in world
coordinates, so old published bases stay valid; only the grid→world density changes.

What it touches (one dedicated session, Phase C):
- Parametrize tile→world spacing (`100/GRID` instead of literal `*10`, `+5` centers) in
  App (patrol, pitch targets), battle.ts, defense.ts, IsometricMap funnel overlay
- planPath / cellOf: GRID² grid instead of hardcoded 10×10 / round(v/10)
- Bounds literals (0..9, 0..8 anchors, clamps) → GRID-derived
- BOARD_W/H, ORIGIN, useBoardScale re-derive; INITIAL positions + decor recenter
- Save migration: shift existing layouts +1,+1 to recenter (idempotent, like the 2×2 one)
- Re-run the balance sim + a full visual/playtest pass after

---

## Audit findings — what's actually not right today

### P0 — broken promises (features that exist but lie)
1. **Revenge vs a LIVE rival attacks a FAKE base.** `handleRevenge` looks the attacker up
   in the bot OPPONENTS list; real players never match → generic template at rating 50.
   The fix uses what we already store: save `attacker_pid` into the defense-log entry,
   revenge fetches their REAL published base. This is the revenge loop actually closing.
2. **PVP-SETUP.md documents the old honor-system setup** — the schema and auth flow
   changed completely (anonymous auth, RLS, rate limits). The doc is now wrong. Rewrite.
3. **README screenshot is generations old** — predates the island board, fences,
   patrols, 2×2 footprints. The public face of the repo undersells the game.
4. **"Recent Results 3–0"** — raid stars displayed as a football score. Nonsense to a
   football fan (Amelia lens). Show Game Balls + % destroyed instead.
5. **Coach level does nothing.** XP bar fills, number grows, zero gameplay effect.
   Honest minimum (not a feature): tooltip/copy stops implying progression it doesn't
   have — or fold XP into an existing wired stat. Decide in Phase A.

### P1 — untested reality
6. **Touch/mobile is completely unverified.** Every interaction was built and tested
   with synthetic mouse pointers. Drag-carry, sled paint, chip drags, HUD layout at
   phone widths — all unknown on a real thumb. This is the single biggest risk to
   "the game is actually good." Needs the real phone session (user + assistant).
7. **Fresh-player FTUE hasn't been replayed since ~10 systems shipped.** Tutorial →
   goals → first raid → first defense → Chalkboard intro: does the order still teach
   the game that exists today? Full fresh-save playthrough with fixes.
8. **Balance sim is stale** vs live battle reality (defenders, plans, roles, flavors,
   energy cost, parking). Re-run, compare to BALANCE.md targets, tune only what's off.

### P2 — feel debt inside existing features
9. Replay POV copy is attacker-framed while the defender watches ("Your hero is down!"
   = THEIR hero). Flip the announcer strings in replay mode.
10. Funnel overlay recomputes 8 A* runs ~10×/sec while patrollers tick — memoize on
    (walls, bus, stadium, editMode).
11. Defense scrimmage waves scale off `aiMult` (attacker strength) — conceptually
    tangled; document or decouple.
12. Replay end-timing can differ from the original when the attacker ran dry early
    (spectator army hack). Cosmetic; note in code, fix only if cheap.
13. Chalk intro card: add the "drag chips from inventory/shop" move (it teaches 4 moves,
    there are now 5).

### Working well — don't touch
Battle core + drama + juice; Game Plans; coaches/season arc; turret personalities;
pathfinding + seal rating; leaderboard; hardened PvP + replays; Chalkboard interactions;
dailies; gacha/star-up; economy sinks (parking/slots/upgrades/heroes).

---

## The plan (v2 — slower, design-led)

**Phase A — Truth pass** (solo): the five lies (revenge/docs/README/results-score/dead
XP meter) + replay POV + funnel memo + intro copy + error boundary + save export +
Reset→Settings placement (D6, D7, D8 minimums).

**Phase B — Design system pass** (solo, THE new phase): D1 tokens (type scale, button
anatomy, modal shell, semantic colors, spacing) swept through every screen; D2 UI
chrome adopts black/orange identity; D4 meter cleanup + tooltips; D5 accessibility
floor (lane patterns, text floor, reduced motion); D3 fiction/copy pass over all
strings. Commission the home-building team-color recolor from Antigravity in parallel.

**Phase C — Device reality** (WITH Jumaane): the phone session — two devices raiding
each other, thumbs on the Chalkboard, full fresh-save FTUE run. Everything it surfaces
gets fixed before Phase D. QA-CHECKLIST.md born here.

**Phase D — 12×12 board** (solo, 1 session): the expansion + vitest suite FIRST (so the
refactor is caught by tests), then balance sim re-run + full playtest.

**Exit criteria:** all P0/P1 + D1–D8 minimums closed, phone-verified, sim green, rubric
written → re-rate the game → only then does anything leave the PARKED list.
