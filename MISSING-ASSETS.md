# Missing Assets — nano_banana_pro generation queue

Prioritized list of art to generate for Football Headquarters. Prompts are paste-ready
for Higgsfield `generate_image` (model `nano_banana_pro`).

**De-weaponize note:** the battle system is being re-themed to a family/youth-football
brand with **zero weapons — no guns, no bullets, nothing lethal.** All combat below is
footballs, penalty flags, mascots, and fans. The old single gun turret `blitz-tower.png`
is **RETIRED** and replaced by `jugs-machine.png` and friends.

## Shared style → see `ART-DIRECTION.md` (governs all matching)
**Do not hand-write style text.** Use the locked STRUCTURE or CHARACTER prompt template from
`ART-DIRECTION.md §4`, fill in the asset's `{SLOT}` line below, and **attach a reference image**
(`§5`). Home team = **black `#111827` + orange `#f97316` + white**; rivals = **crimson `#b91c1c`**;
generic marks only (no real NFL logos). Run the `§6` acceptance checklist before saving each file.

## Post-processing (after download)
Run the existing PIL flood-fill knockout to make the background transparent, then drop the
PNG into the path shown. Target canvas: **1024×1024** for buildings/turrets/heroes/mascots,
**512×512** for units/projectiles. Keep the object filling **~80–90% of the frame**.

All paths are under `public/assets/`, referenced in code as `/assets/...`.

---

## ⚠️ TIER 0 — TRADEMARK REDO (do before any public use)
The player sprites already generated use **real NFL team logos** (Chicago Bears "C",
Philadelphia Eagles wings, Rams horns). That's a legal risk for a branded game — regenerate
these with **generic, original marks only**. Add to every prompt: *"generic fictional team,
NO real-world or NFL team logos, names, or trademarks — use a simple original mark (plain
star, shield, chevron, or single letter)."*

- **Secondary unit trio** → `public/assets/units/secondary-{idle,ready,training}.png` (512²) — currently Bears/Eagles logos. Same poses as Tier-1 #4 below, generic navy uniforms, plain original crest.
- **Burner hero** → `public/assets/heroes/burner.png` (1024²) — currently a Rams-style gold horn. Regenerate a sprinting WR with a plain original helmet mark.
- *(Spot-check the other generated sprites — coach/kicker/blocking-sled/towers read clean, but confirm no stray real logos before launch.)*

---

## TIER 1 — Unblocks the de-weaponize code work (do first)

### 1. Football projectile → `public/assets/battle/football-proj.png`
The core projectile — replaces every bullet/shell effect in the game. Used by the JUGS
machine (and any other ranged defense/hero ability).
- Canvas: 512×512
> A single American football spiraling through the air, tight spiral rotation, laces
> visible, motion streak trailing behind it, dynamic mid-flight angle.

### 2. JUGS Machine (defense) → `public/assets/battle/jugs-machine.png`
Ranged defense — **replaces the old gun turret `blitz-tower.png`**. Fires `football-proj.png`
at attackers. Mechanical football pitching machine, NOT a gun: no barrel, no muzzle, no
gun silhouette of any kind.
- Canvas: 1024×1024
> A mechanical football JUGS pitching machine on a wheeled steel frame, twin spinning
> rubber throwing wheels, yellow-and-black safety padding, braced with sandbags on turf,
> a football loaded in the feed chute, sports-equipment look, clearly not a weapon.

### 3. Blocking Sled (wall) → `public/assets/battle/blocking-sled.png`
Replaces the CSS hazard-stripe blocks currently drawn for every wall. Highest visual
ROI — walls are all over every battle.
- Canvas: 1024×1024
> A football blocking sled / tackling sled painted in yellow-and-black hazard stripes, low
> heavy steel barrier with thick padded tackling pads on the front, planted on turf, rugged
> and defensive-looking, isometric 3/4 view.

*(After adding, swap the wall render in `BattleScreen.tsx` from the CSS gradient block to
`<img src="/assets/battle/blocking-sled.png">`.)*

### 4. Secondary unit — REDO framing → `public/assets/units/secondary-{idle,ready,training}.png`
Current `secondary-idle.png` fills only **~38% of the frame width**, so it renders skinny
and tiny next to the other units. Regenerate all 3 states filling ~85% of frame like the
other unit trios.
- Canvas: 512×512
> A trio of three American-football defensive-back players (cornerbacks/safeties) in navy-blue
> uniforms standing together in a tight group, athletic ready stance, filling most of the frame,
> matching the framing and scale of a standard unit-squad sprite.
- `idle` — relaxed standing
- `ready` — crouched, hands on knees, alert
- `training` — mid-sprint / backpedal drill

---

## TIER 2 — Remaining non-weapon defenses + projectile

### 5. Tackling Sled (melee defense) → `public/assets/battle/tackling-sled.png`
Melee defense that stops attackers up close — motorized, padded, no blades/spikes.
- Canvas: 1024×1024
> A motorized football tackling sled on treads, thick padded swinging arms extended
> outward, yellow-and-black impact padding, steel frame, aggressive stance planted on
> turf, mechanical sports-equipment design, no sharp edges.

### 6. Ref Tower (stun/slow defense) → `public/assets/battle/ref-tower.png`
Tall referee/coach tower — a striped-shirt referee figure up top throwing a yellow
penalty flag, which stuns or slows nearby attackers.
- Canvas: 1024×1024
> A tall wooden-and-steel referee tower with a ladder, a referee figure in a black-and-white
> striped shirt and cap standing on top mid-throw of a yellow penalty flag, whistle around
> his neck, elevated lookout platform, sports-officiating theme.

### 7. T-Shirt Cannon (AoE slow) → `public/assets/battle/tshirt-cannon.png`
Comedic stadium t-shirt/gatorade air cannon on a wheeled cart — playful, clearly
non-lethal, slows a group of attackers on impact.
- Canvas: 1024×1024
> A comedic stadium t-shirt air cannon mounted on a wheeled cart, big round barrel, bright
> team-colored tank and hoses, rolled t-shirts poking out the muzzle, playful carnival/tailgate
> look, clearly a fun prop and not a weapon.

### 8. Penalty Flag (projectile) → `public/assets/battle/penalty-flag.png`
Secondary projectile — thrown by the Ref Tower.
- Canvas: 512×512
> A wadded yellow penalty flag with a small weighted end, tumbling through the air mid-throw,
> bright flag-yellow fabric, motion streak trailing behind it.

---

## TIER 3 — Units, mascot, heroes

### 9. Mascot (hype unit) → `public/assets/units/mascot.png`
Player + enemy hype unit — buffs nearby units, doesn't attack directly.
- Canvas: 1024×1024
> A big goofy furry stadium mascot costume character, oversized head, team jersey, striking a
> hype/celebration pose with arms raised, exaggerated cartoonish proportions, playful and
> non-threatening.

### 10. Fan Mob (swarm unit) → `public/assets/units/fan-mob.png`
Cheap swarm unit — a small cluster of rowdy fans storming the field.
- Canvas: 512×512
> A small tight cluster of rowdy face-painted football fans wearing foam fingers and waving
> pom-poms, team jerseys, mid-charge storming forward, energetic group pose, filling most of
> the frame.

### 11. The General (Coach hero) → `public/assets/heroes/coach.png`
- Canvas: 1024×1024
> A grizzled veteran American-football head coach hero character, headset and clipboard, team
> windbreaker and cap, commanding heroic stance, stylized game-character proportions, buff.
Suggested kit: aura ability that buffs nearby troops (team-wide rage-lite).

### 12. The Specialist (Kicker hero) → `public/assets/heroes/kicker.png`
- Canvas: 1024×1024
> A lean athletic American-football placekicker hero character mid follow-through of a powerful
> kick, single-bar facemask, glowing football, dynamic action pose.
Suggested kit: long-range "Onside Bomb" that lobs a glowing football across the base.

### 13. The Burner (WR speedster hero) → `public/assets/heroes/burner.png`
- Canvas: 1024×1024
> A fast wide-receiver hero character in a full sprint, gloves, visor, motion-blur speed lines,
> lean and explosive, confident heroic look.
Suggested kit: dash ability — teleport-blitz to the nearest untouched building.

---

## EPIC 1 — New heroes (character sprites, 1024², CHARACTER template + generic marks)
These are unlockable heroes with distinct impacts. **Include women heroes** (Dr. Sloane, The Captain, The Playmaker are women). Each currently renders as an emoji placeholder in-game and auto-swaps to its PNG when it lands.
- `public/assets/heroes/medic.png` — **Dr. Sloane** (woman, Team Doctor): athletic-trainer hero in green, medical kit / red-cross armband, caring-but-fierce stance, healing glow. Ability: heal aura.
- `public/assets/heroes/captain.png` — **The Captain** (woman, Safety): team captain in sky-blue, arm band with a "C", shield-forward protective stance. Ability: shield wall.
- `public/assets/heroes/playmaker.png` — **The Playmaker** (woman, WR): flashy wide receiver in pink/magenta, top-hat-and-cane "trickster" flourish, dynamic juke pose. Ability: summon players.
- `public/assets/heroes/legend.png` — **The Legend** (GOAT, premium): regal purple-and-gold aura, crown motif, iconic hall-of-fame superstar, glowing, larger-than-life. Ability: team-wide rage+heal.

## EPIC 2 — Single-player battle sprites (de-clump the raids)
The old unit sprites are **clumpy trios** (3 players in one image). Battles should show
**individual football players**. Generate ONE player per unit type (512², CHARACTER template,
home **black/orange** kit + a visible jersey number, mid-run action pose). In-game each renders
as a jersey-number chip until these land, then auto-swaps in.
- `public/assets/units/offensive-line-player.png` — a single beefy offensive lineman charging forward.
- `public/assets/units/skill-positions-player.png` — a single skill player (RB/WR) sprinting with the ball.
- `public/assets/units/defensive-line-player.png` — a single defensive lineman bull-rushing.
- `public/assets/units/secondary-player.png` — a single defensive back in a fast breakdown run.
*(Keep the existing `-idle/-ready/-training` trios for the roster/base screens — these `-player`
sprites are battle-only.)*

## Already covered (no action)
- Base buildings: stadium, practice-field, headquarters, film-room, weight-room (levels 1–5)
- Units: offensive-line, skill-positions, defensive-line (idle/ready/training) — Secondary needs redo (Tier 1 #4)
- Heroes: qb (The Franchise), enforcer (The Enforcer)
- Icons: coins, energy, level, xp
- Decor: club-fountain, merch-stand, parking-lot, statue-legends, tailgate-tent, team-bus
- `special-teams` unit sprites exist but are **unused** in battle (roster is 4 units) — spare if a 5th unit is ever added
- **RETIRED:** the old single gun turret `blitz-tower.png` — replaced by `jugs-machine.png` (Tier 1 #2)
