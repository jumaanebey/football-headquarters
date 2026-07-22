# Phase 5 — Track A handoff (enemy-base art conformance)

Track B (drawn Game Plan icons) is **shipped** (commit `e1c24b8`). Track A is art
generation + a small optional field recolor. Everything below is scouted and turnkey.

## 1. Sprites to regenerate (art step — Antigravity/Gemini)

The enemy base wears **rival-specific** building skins, resolved in `assets.ts`:
`battleBuildingSprite()` → `rival-stadium.webp` (HQ) + `RIVAL_POOL` loot buildings.

Regenerate these **5 files** at `public/assets/buildings/` (style-matched to the home
base: dark slate + glass + metal trim, emissive warm window glow, night grounding, banner
flags; swap ONLY the accent orange `#f97316` → crimson `#b91c1c`; gold `#fbbf24` stays):

| File (keep the exact name) | Role | Per-spec conversion |
|---|---|---|
| `rival-stadium.webp` | enemy HQ | crimson stadium, home-base construction language |
| `rival-headquarters.webp` | loot building | Barn → **Rival Clubhouse** (slate+glass skybox; keep the satellite dish) |
| `rival-film-room.webp` | loot building | style-match to home Film Room, crimson accent |
| `rival-weight-room.webp` | loot building | style-match, crimson accent |
| `rival-practice-field.webp` | loot building | style-match, crimson accent |

**Requirements:** same footprint/resolution and isometric angle as the sprites they
replace (use `docs/screenshot.png` buildings as the angle ref); transparent background;
no text. Also emit the matching `.png` source alongside each `.webp` (repo convention).

**Drop-in = ZERO code changes.** Same filenames → the game picks them up automatically.
If art delivers *new* filenames instead, update `RIVAL_POOL` (assets.ts:64) and the
`rival-stadium` path (assets.ts:85).

⚠️ **Watchtower / wagon caveat:** the spec's "timber watchtower → Broadcast tower" and
"red wagon → Equipment truck" may be the **defense turrets** (`ref-tower`, `tshirt-cannon`
in `/assets/battle/`), which are **SHARED between the home base and the enemy base**
(`DEFENSE_FLAVOR_SPRITE`, assets.ts:65-66). Regenerating those changes YOUR base too, and
they were already refreshed in the July defense-depth round. Confirm whether those two are
rival buildings or shared turrets before touching turret art — the 5 files above are
unambiguously enemy-only.

## 2. Field green (code — needs a color sign-off)

The "bright daylight green" is the iso field surface in `components/BattleScreen.tsx`:

- `:1204` grounds plane — `fill="#20522f"` (dark green, ok-ish)
- `:1207` **yard stripes** — `fill={i % 2 ? '#2b8a3e' : '#2f9e44'}` ← the bright green
- `:1210` top end zone `#b45309`, `:1211` bottom end zone `#1e293b`

This is a real tunable, but the field renders the SAME in **attack AND defense** views —
darkening it recolors the whole battle screen, not just enemy maps. It's a one-edit change
(e.g. stripes → `#14532d`/`#166534` night turf). Left for Jumaane's color call / the mock's
palette rather than guessed.

## 3. Verification after art lands
- Tutorial raid + campaign stages show the new enemy structures; eyeball vs. home base =
  same style family, crimson vs. orange accent.
- `npm run balance` exit 0 with identical numbers; `npm test` green; no footprint/collision
  diffs (pure sprite/color swap — no template stats/footprints touched).
