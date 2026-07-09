# HERO-SPRITES.md — hero sprite system reference

The single source of truth for hero art: what exists, where it lives, how it animates,
how to generate more, and how every file gets verified before it ships.

## The system in one paragraph

Each hero is a **layered CSS puppet**, not a video or a Spine rig. Separate PNG layers
(body pose A, action pose B, walk frames, shared fx) are stacked and driven by CSS
keyframes on a shared 7-second clock per hero, staggered between heroes. Pose *swaps*
carry the big beats (throw, kick, truck stick); whole-body transforms (sway, squash,
hop) carry the idle; shared fx layers (flame ring, glow, ball) carry the spectacle.

## Identity canon

The base card art `public/assets/heroes/<key>.png` is CANON for each hero's face, hair,
build, and uniform. Every generated layer must attach it as the reference image AND
spell out identity anchors in the prompt (gender, hair, distinctive gear) — reference
images alone have flipped identity twice (Dr. Sloane is a MAN with short dark hair;
prompts that said "her" invented a woman).

| key | name | role | signature action | notes |
|---|---|---|---|---|
| qb | The Franchise | QB | pose-swap throw; card is MIRRORED (`flipX` wrapper) so he reads right-handed and throws to the viewer's RIGHT | ball uses `fhq-ball-inhand` — visible in hand the whole cycle, cocks with the windup, launches on the snap |
| enforcer | The Enforcer | RB | Truck Stick shoulder charge | |
| coach | The General | HC | shouting play-call point | older, bearded, tracksuit + cap |
| kicker | The Specialist | K | kick follow-through | ball spawns at foot, flies up-right (`fhq-qb-ball`) |
| burner | The Burner | WR | sprint lunge | tinted visor; jersey 88 (from base art) |
| medic | Dr. Sloane | Team Doc | rally-heal, arms raised | MAN, short dark hair, headset — do NOT genderflip |
| captain | The Captain | S | Shield Wall brace | "C" patch |
| playmaker | The Playmaaker | WR | juke + stiff-arm | jersey 88 (duplicate of burner's — cosmetic, from base arts) |
| legend | The Legend | GOAT | arms-wide showboat | gold visor, jersey 21 |

## File inventory

```
public/assets/heroes/
  <key>.png                     # base card art (CANON identity; used as gen reference)
  franchise-rig/                # QB got the pilot rig, richer than the rest
    body.png                    # clean body, empty hands, no aura (pose A)
    body-followthrough.png      # release pose (pose B)
    aura-ring.png               # golden flame ring — SHARED by all heroes, hue-rotated per hero
    aura-glow.png               # soft radial glow (procedural PIL)
    ball.png                    # glowing football w/ flame trail
    arm-throw.png               # BANKED: clean separate arm for a future true-arm rig
  rig/
    <key>-body.png              # pose A: clean idle body, hands empty, no effects
    <key>-action.png            # pose B: signature action
    <key>-walkA.png             # walk frame: LEFT foot forward, facing viewer-LEFT
    <key>-walkB.png             # walk frame: RIGHT foot forward, facing viewer-LEFT
    <key>-idleA.png             # CARD leg loop: weight on LEFT leg (idle shuffle, not a stride)
    <key>-idleB.png             # CARD leg loop: weight on RIGHT leg — alternates w/ idleA
                                # every ~0.55s via fhq-idleA/B. qb's pair is ARM-LOCKED
                                # (ARMLOCK prompt in gen_card_idle.py): arms must match the
                                # reference exactly or the in-hand ball floats — first run
                                # without it relaxed both arms and was thrown away
```

All layers: 1024², transparent, zero opaque pixels touching any edge, zero interior
green-dominant pixels. Walk frames face the VIEWER'S LEFT; battle code flips with
`scaleX(-1)` for rightward movement.

## Animation wiring (where the code lives)

- **Keyframes**: `index.html` — `fhq-qb-body` (pose A: idle sway + wind-up + hide during
  swap), `fhq-qb-body2` (pose B: snap in at 83.5–95% of the cycle), `fhq-qb-ball` /
  `fhq-ball-left` (appear-at-release projectile flights), `fhq-ball-inhand` (QB card:
  ball held all cycle → cock back 72–82% → fly right on the snap — pair with a `flipX`
  wrapper around body+action ONLY; the ball layer stays outside the flip, in screen
  space), `fhq-hero-idle` (fallback whole-body idle),
  `fhq-aura` (ring spin), `fhq-glow` (glow breathe). Names say "qb" for historical
  reasons — they are generic.
- **Card rigs**: `components/HeroModal.tsx` → `HERO_RIG` map (body/action paths +
  optional ball spawn/flight). Stagger: `animation-delay: -(heroIdx*1.9 % 7)s` on all of
  a hero's layers (same delay per hero keeps its layers in sync).
- **Transform-order gotcha**: `scaleX(-1)` must be LAST in the transform list or it
  mirrors the translation too and the projectile flies the wrong way.
- **Battle walk cycle** (target design): units carrying hero art alternate
  `<key>-walkA/-walkB` every ~220ms while their position is changing, `scaleX(-1)` when
  moving right, drop to `-body` when stationary, `-action` while attacking.

## Generation pipeline

- `scripts/gen_asset.py` — single asset: Gemini (`gemini-2.5-flash-image`, key in
  `.env`), `--ref` for identity, chroma knockout + corner flood-fill fallback +
  edge/interior verification + auto-defringe. ~3–4¢ per image.
- `scripts/gen_hero_rigs.py [key ...]` — body+action pairs (skips existing files;
  delete a file to regenerate it).
- `scripts/gen_hero_walks.py [key ...]` — walkA/walkB pairs.

Prompt laws (violating any of these has caused a real reshipped defect):
1. Attach the base art as `--ref` AND write explicit identity anchors in the prompt.
2. Never ask for green elements — the model refuses them on a chroma-green screen
   (JV crest ribbon, twice). Generate neutral, tint programmatically after knockout.
3. "no text" always; expect position letters/numbers from base art to carry over (fine).
4. Hands EMPTY on rig layers — held objects break pose swaps.
5. Full body, margins on all edges, ~80% canvas height.

## Verification checklist (every delivery, no exceptions)

1. Pixel scan: zero near-edge opaque px, zero interior green-dominant px (the script
   does this; Antigravity's edge-only checks missed interior residue 4 times).
2. **Eyeball the actual file** — verify identity against the base art (gender, hair,
   uniform, build). Machine checks can't catch a genderflip.
3. Stack test for paired layers: poses A/B should overlay at the same scale/position.
4. Timed-animation check: seek `anim.currentTime = progress*7000 + delayMs` (delay is
   NEGATIVE) and read computed opacity — long JS poll loops get throttled.

## Roadmap

- [x] Card rigs: all 9 heroes, two-pose action swaps (Round 8)
- [ ] Walk cycles wired into BattleScreen (frames generating — Round 9)
- [ ] True-arm QB rig using banked `arm-throw.png` (rotate at shoulder pivot)
- [ ] Battle-scale action swaps (use `-action` frame while a hero unit attacks)
- [ ] Board walkers upgraded from position-group singles to hero walk frames
