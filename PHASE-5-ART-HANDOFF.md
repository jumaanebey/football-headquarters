# Phase 5 — Track A handoff (enemy-base art conformance) — FINAL

**Shipped already:** Track B drawn Game Plan icons (`e1c24b8`) · battle field darkened to
night turf (`5af0586`).

**Remaining = the art drop.** Generation is the **Antigravity/Gemini** step; Claude Code
**wires** (zero code change — see below). Design ruling 2026-07-22: **defense turret sprites
stay SHARED** (silhouette recognition > team color mid-raid). A crimson accent-swap turret
variant is a nice-to-have follow-up, NOT part of this list, and must not block Phase 5.

## Scope: 3 regenerations (2 buildings + 1 field fix)

Verified by opening every enemy sprite. Only these read as an older art generation:

| File (keep exact name) | Current sprite | Target |
|---|---|---|
| `rival-film-room` | **thatch-roof barn** cabin (stone base, glass skybox, satellite dish, warm glow) | **Rival Clubhouse** — thatch roof → slate + glass skybox; KEEP the dish |
| `rival-headquarters` | **curved-roof wagon/trailer** (crimson roof, dish, barrels, wheels) | **Equipment truck** — same sprite family as the home-base truck, crimson |
| `rival-stadium` | enemy HQ stadium — **bright daylight-green field baked into the sprite** | recolor ONLY the interior field to night turf (see palette) — stands/structure are fine |

Out of scope (leave as-is): `rival-weight-room` (crimson-brick gym) and `rival-practice-field`
read as acceptable crimson/castle theme. The reviewer's "timber watchtower" was the shared
`ref-tower` **turret** — excluded per the ruling above.

## Conformance rule — same bones, rival colors
Reuse the home-base construction language exactly (dark slate + glass + metal trim, emissive
warm window glow, night grounding, banner flags) and swap ONLY the accent channel:
orange `#f97316` → crimson `#b91c1c`. Gold `#fbbf24` stays shared. For the stadium field,
match the board's shipped night turf: stripes `#123522`/`#15402a`, apron `#0e2417`.

## Exact output specs (match the sprites being replaced)
- **`.png` source at 1024×1024**, transparent background, no text.
- **`.webp` at 512×512** (this is what the game loads), transparent.
- Same isometric angle + on-canvas footprint/scale as the current file (overlay-check
  against the existing sprite so board placement/collision is unchanged). Angle ref:
  `docs/screenshot.png` and the home-base `stadium-3` / `headquarters-1` / `film-room-1`.

Deliver all three (`rival-film-room`, `rival-headquarters`, `rival-stadium`) as `.webp` +
`.png` at `public/assets/buildings/`, **same filenames**.

## Wiring (Claude Code, once assets land) — ZERO code change
`assets.ts` already routes enemy buildings to these exact paths (`RIVAL_POOL` +
`rival-stadium`). Same filenames → picked up automatically. I only touch code if art ships
NEW filenames (then update `RIVAL_POOL` at assets.ts:64 / the `rival-stadium` path at :85).

## Verification after drop
- Tutorial raid + campaign stages show the new Clubhouse / Equipment truck; stadium field
  reads night turf (matches the board).
- Eyeball vs. home base: same style family, crimson vs. orange accent.
- `npm run balance` exit 0 (identical numbers), `npm test` green, no footprint/collision
  diffs — pure asset swap.
