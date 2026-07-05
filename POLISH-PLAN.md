# POLISH PLAN — close every loop before anything new ships

Status date: 2026-07-05. Rule in effect: **feature freeze**. Everything below perfects
what already exists. Parked until this plan is done: clans, replay sharing, purchasable
land, music, club rename, new units/heroes/buildings.

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

## The plan

**Phase A — Truth pass (1 session, no user needed):**
items 1, 2, 3, 4, 5, 9, 13 + quick wins 10/11. Every feature tells the truth about
itself; docs match reality; revenge is real.

**Phase B — Device reality (needs Jumaane):**
the phone session — two devices, raid each other, watch replays, use the Chalkboard
with thumbs. Fix everything it surfaces before moving on. Item 7 (fresh FTUE run)
happens here too, on the phone.

**Phase C — 12×12 board (1 dedicated session):**
the expansion above + balance sim re-run (item 8) + full playtest. This is the only
"big" change, and it's a correction of an existing wrong, not a new feature.

**Exit criteria:** every P0/P1 closed, phone-verified, sim re-run green → then we
reassess the 1–10 rating and decide what earns its way off the parked list.
