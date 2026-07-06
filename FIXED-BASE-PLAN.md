# FIXED BASE PLAN — no customization, fixed places, fixed upgrades

**Decision (2026-07-05):** The board has fixed building places and a fixed upgrade ladder.
No placement, no dragging, no wall painting, no inventory. Upgrading IS the base game
(the Top Eleven model — pre-validated: facility investment with zero placement is that
game's most-loved loop). This deletes the entire class of mobile placement bugs.

---

## 1) The fixed map (10×10, all anchors permanent)

All facilities are 2×2 (anchor = top cell). These are the canonical homes:

| Piece | Anchor | Notes |
|---|---|---|
| Stadium | (6,6) | The heart. Walled ring around it. |
| Training Field | (2,2) | NW quadrant |
| Scouting Dept | (6,2) | NE quadrant |
| Rehab Center | (3,5) | W center |
| War Room | (3,8) | SW corner |
| Team Bus | (5,9) | Parked at the south gate — fixed blocker (HP = wall × 2.2) |
| Decor | statue (5,3) · merch (9,4) · fountain (1,7) · tailgate (9,7) · lot (1,3) | unchanged |

Walls: **automatic ring** — count comes from the existing `wallCap(stadiumLevel)`
(16 + 2×SL, max 40). SL1 starts with the 12-segment inner ring at 5–8 × 5–8; higher
Stadium levels extend outward in a FIXED order (`FIXED_WALL_ORDER` array — outer arcs
south → east → north → west, since attackers enter from map edges). Wall HP scales
automatically: `220 × (1 + 0.08 × (SL−1))`. Zero wall UI remains.

## 2) Defense slots — fixed spot, fixed kind, upgradable level

Nine permanent emplacements. Slot count follows the existing `maxDefenses()` ladder
(2 + ⌊SL/3⌋, max 6) plus the 3 crown-purchased slots (`EXTRA_SLOT_COSTS` 40/80/120 — kept).

| Slot | Kind | Tile | Unlocks | Covers |
|---|---|---|---|---|
| D1 | JUGS Machine | (5,4) | Stadium L1 | north approach |
| D2 | Tackling Sled | (8,6) | Stadium L1 | east gate |
| D3 | Ref Tower | (4,4) | Stadium L3 | NW long lane |
| D4 | T-Shirt Cannon | (8,8) | Stadium L6 | SE cluster |
| D5 | JUGS Machine | (4,8) | Stadium L9 | SW lane |
| D6 | Tackling Sled | (5,6) | Stadium L12 | inner keep |
| C1 | Ref Tower | (8,3) | 40 crowns | NE overwatch |
| C2 | T-Shirt Cannon | (2,6) | 80 crowns | W splash |
| C3 | JUGS Machine | (7,9) | 120 crowns | S gate |

**Buying a slot's piece:** first activation costs the kind's existing shop price
(JUGS 2500 · Sled 1800 · Ref 3200 · T-Shirt 2200).
**Upgrading (NEW ladder, L1→L10):**
- cost = `0.6 × kindCost × 1.35^(L−1)` (JUGS: 1500 → 2025 → 2734 → … → L10 ≈ 23.1k)
- effect = `+12% HP and +10% damage per level` (multiplicative on the kind's base stats)
- Piece level may not exceed Stadium level (same gate as facilities).

## 3) Facility ladder (unchanged economy, now the whole game)

- Cost to reach level N: `1400 × 1.7^(N−2)` (existing `UPGRADE_CONFIG`).
- Build times: existing `upgradeDurationSecs`, builders, gem-skip — all unchanged.
- Gate: non-Stadium buildings ≤ Stadium level (existing rule). Stadium cap **L12**.

Real wired effects per level (existing `buildingEffect` — single source of truth):

| Level | Cost | Stadium (coins/min · storage) | Training (+XP) | Scouting (roster) | War Room (+readiness) | Rehab (energy/min) |
|---|---|---|---|---|---|---|
| 1 | — | 90 · 300 | +10% | 12 | +10% | 7.5 |
| 2 | 1,400 | 180 · 600 | +20% | 14 | +20% | 8.3 |
| 3 | 2,380 | 270 · 900 | +30% | 16 | +30% | 9.4 |
| 4 | 4,046 | 360 · 1,200 | +40% | 18 | +40% | 10.7 |
| 5 | 6,879 | 450 · 1,500 | +50% | 20 | +50% | 12.5 |
| 6 | 11,694 | 540 · 1,800 | +60% | 22 | +60% | 15.0 |
| 7 | 19,880 | 630 · 2,100 | +70% | 24 | +70% | 15.0 (floor) |
| 8 | 33,796 | 720 · 2,400 | +80% | 26 | +80% | 15.0 |
| 9 | 57,454 | 810 · 2,700 | +90% | 28 | +90% | 15.0 |
| 10 | 97,672 | 900 · 3,000 | +100% | 30 | +100% | 15.0 |
| 11 | 166,042 | 990 · 3,300 | +110% | 32 | +110% | 15.0 |
| 12 | 282,271 | 1,080 · 3,600 | +120% | 34 | +120% | 15.0 |

Stadium level also drives (all existing formulas): defense slots, wall count/HP,
shield, and unlock gates. Parking Lot stays exactly as-is (fixed upgrade, 3 levels).

## 4) What gets DELETED (the payoff)

- Chalkboard **edit mode**: drag-and-drop, carry, sled wall-paint, flips, moves,
  Store All, inventory chips, undo stack, buy-and-place, funnel editing overlay.
- `StoredPieces` inventory, `DefensePiece.flip`, free placement of bus.
- All placement hit-testing/ghost/pending-grab complexity in IsometricMap edit mode
  (view-mode camera, zoom, pan, tap-to-open all stay).

**Chalkboard becomes the FRONT OFFICE:** one clean panel listing every slot —
5 facilities, 9 defense emplacements, parking, perimeter (read-only), bus — each with
current level, live effect, next-level effect, cost, and an Upgrade button.
🧪 Test Defense stays. Seal-quality grade stays (computed on the fixed layout).

## 5) Migration (no player loses value)

On first load of an old save:
1. Buildings snap to canonical anchors (positions discarded).
2. Owned defense pieces auto-fill matching-kind slots in slot order (as L1 pieces);
   pieces with no free matching slot → **full coin refund** at shop price.
3. Inventory (stored pieces) → full coin refund.
4. Player-placed walls dissolve; ring regenerates from Stadium level; each wall owned
   beyond the free ring refunds its purchase price.
5. `bonusDefSlots`, parking level, bus → kept (bus snaps to its fixed spot).

## 6) PvP simplification

- `publishBase` payload shrinks to **levels + unlocked slots** (no layout JSON) —
  smaller rows, and layout cheating becomes impossible (geometry is derived, not trusted).
- `defenseLayoutFromBase` reads FIXED_LAYOUT + levels → both attacker and defender
  derive identical boards. Replays unchanged (already deterministic).
- Base variety now comes from *which slots you've unlocked/leveled*, roster tendencies,
  heroes, and Game Plans — not geometry.
