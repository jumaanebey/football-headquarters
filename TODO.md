# Football Headquarters — TODO

Running task list. Rules (per ~/CLAUDE.md): only mark complete when Jumaane confirms;
never delete incomplete tasks.

## Open — from the July 2026 full review

- [ ] **Early-base defense balance** — SHIPPED 475ee6f (confirm to close): newbie mercy in
      `raidAiMult` — attackers hit at 78% strength vs Stadium L1, 90% vs L2, full from L3.
      Applies to offline raids, Test Defense, and the balance sim (one shared curve).
      Keep watching real early-account results before further tuning.
- [ ] **Formation unlock timing** — SHIPPED 475ee6f (confirm to close): all three schemes
      selectable from Stadium L1 (`formationUnlocked` → always true); progression carried by
      the 9-slot emplacement ladder + mastery. Test + audit-runner assertions updated.

## Verified already done (claimed as open in that review)

- [x] Attacker-side formation fidelity + scouting — defender's published layout carries
      `formation`; `counterMultFor` applies weak/strong multipliers (replay-safe);
      in-battle "📋 They're running X" + "countered"/"they're soft vs this" badges on play
      calls; pre-raid scouting chips on Game Day target rows. (BattleScreen.tsx:190-206,
      1210-1223; shipped 46c840b/e2ed3e4, re-verified 2026-07-07.)

## Standing / pre-launch

- [ ] ⚠️ Remove the `vega300` owner boost (URL param + Settings redeem path) before wide launch
- [ ] Balance watch: post-castle density + defense buffs may push ladder win rates below
      the 60–75% attacker-fun target
- [ ] Jumaane phone-verify pass after each deploy batch (fresh tab — Safari cache ritual)
- [ ] Coach portrait preload — SHIPPED 475ee6f (confirm to close): all 18 portraits warmed
      on an idle tick 2.5s after boot (`preloadCoachArt`)
- [ ] README screenshot — SHIPPED 475ee6f (confirm to close): fresh L12 black/orange board
      capture; `scripts/readme-shot.mjs` also updated to the fixed-base save shape (note:
      Playwright launch hangs on this machine — shot was taken via screencapture instead)
- [ ] Sound — MAJOR PASS SHIPPED (confirm to close): synth palette extended (thud, boom,
      whoosh, suspense tick, reveal sting, coin-land ding) and wired into every juice
      moment: deploys thud, facility sacks boom+roar, verdict plays victory/defeat,
      gacha ticks then stings (fanfare on a NEW hero), coin arcs ding on arrival,
      formation switches whoosh. Crowd bed + kickoff whistle already existed.
      Still open (post-launch): real recorded samples / music loop via ElevenLabs or
      Higgsfield credits if the synth identity ever feels thin

## Art (Antigravity — pipeline closed unless ordered)

- [ ] Rank crest set (8) — biggest remaining art win (ladder uses emoji today)
- [ ] Victory/defeat verdict card art
- [ ] Rival crest set (6–8) for season/raid opponents
- [ ] Loading/splash art (needed for App Store build anyway)
- [ ] Launch round: app icon variants + App Store screenshot frames
- [ ] Hero ability icons (9) — currently emoji, fine until Phase C says otherwise

## Animation / juice backlog — animator's lens (July 2026 sweep)

Shipped this pass: formation-switch GLIDE (buildings slide to new anchors, no teleport),
one-character-layer rule (flat art fully hides under rig frames), hero card action beat
every 5.5s (was buried in a 7s idle), sideline deploy glow, nameplate fade.

Next, in impact order:
- [ ] Scout Search reveal — SHIPPED (confirm to close): spinning flame ring + shaking
      mystery card ~1.4s, hero bursts out with ring recolored to their aura, name +
      NEW/duplicate result, tap to dismiss
- [ ] Collect arc — SHIPPED (confirm to close): coins fly curved paths from the building
      to the HUD counter (nested X/Y easing), count scales with haul
- [ ] Counter rollup — SHIPPED (confirm to close): coins/fans/crowns tick to new values
      (550ms ease-out) with a scale-pop on change
- [ ] Deploy dust — SHIPPED (confirm to close): dust puff blooms under every troop/hero/
      special drop (new 'land' fx type, dust-impact.png)
- [ ] Verdict card entrance — SHIPPED (confirm to close): card scale-bounces in; earned
      game balls stamp in one-by-one (0.28s stagger). Sfx still open.
- [ ] Damage numbers — SHIPPED (confirm to close): spawn 1.6x pop, deterministic sideways
      drift + ease-out rise (arcs, not elevator floats)
- [ ] Drive meter milestone pulses — SHIPPED (confirm to close): crossing 25/50/75/100
      pops the Drive % readout, bumps crowd-bed intensity, fires a roar
- [ ] Hero ability cast — SHIPPED (confirm to close): screen edges flash in the caster's
      color (inset glow, 0.7s fade) + whoosh
- [ ] Sheet/modal entrances — SHIPPED (confirm to close): backdrop fades, panel slides up
      with a soft settle (0.26s) — every modal in the game (one Sheet shell)
- [ ] Board walkers — SHIPPED (confirm to close): 8 new position-group walk frames;
      roster walkers stride (two-frame cycle, direction-facing) while WALKING
- [ ] Upgrade-complete celebration — SHIPPED (confirm to close): burst ring + spark
      twinkles + "LEVEL UP!" stamp at the building + fanfare when a job finishes
- [ ] CC-style building tap — SHIPPED (confirm to close): tap → spotlight + title/cost
      over the board + chunky Info/Level Up (+Defense on Stadium, +Game Day on War Room)
      buttons; Info opens the full sheet; tap empty turf deselects

## Football-combat redesign (shipped, confirm to close)

- Deploys are INDIVIDUALS: every troop is a named roster player (announced with their
  power on entry; deploy cards show who's next)
- Role powers: QB throws from range 13 (visible spiraling footballs) · RB 1.4x speed,
  1.5x hit damage · WR +60% damage while a QB is on the field · OL "pocket" — QB/RB
  within 9 units of a live OL take 40% less damage · DL/LB/CB/S flavor tunings ·
  Franchise hero throws (range 13), Specialist hero kicks (range 16)
- 4-frame walk cycles (contact→passing→contact→passing) for all 9 heroes + 4 position
  groups, in battle (attackers + gate guards) and on the home board
- Balance watch: role multipliers are first-pass — tune after ladder data

## Combat contact-feedback pass (shipped ffb5bf9, confirm to close)

Movement-focus round — no new features, pure motion polish on battle:
- Getting hit READS now: troops/guards/buildings flash white + crunch-jolt on
  every damage pop (was a barely-visible transparency dip)
- Buildings flinch on hit; below 30% HP they rock on their foundation until
  they come down (telegraphs the teardown)
- Walk bob is synced to the stride (one bounce per footfall) and runners lean
  into their direction of travel
- ROUND 2 SHIPPED (eaa38d0, confirm to close): attacker lunge into the target
  on the damage-pop beat, broadcast camera drift toward the live fight
  (desktop), ghost trails on every thrown/kicked football, board walkers lean
  into their travel direction (they already had shadows)
- ROUND 3 SHIPPED (1bf96af, confirm to close): FLOATING ISLAND KILLED per
  Jumaane — campus now sits on a wide dark-grounds plane that fades into the
  night (cliff + soil skirt art removed, boundary line where mowed campus
  meets the rough); two cloud-shadow lanes drift over the board; stadium
  crowd does the wave on drive milestones in battle
- ROUND 4 SHIPPED (0a3f7bc, confirm to close): outer grounds dressed per
  Jumaane — striped practice mini-field on the west grounds with two new
  bleacher stands beside it, stadium scoreboard over the NE rough (new art,
  abstract segments, no text), parking pad + team bus parked in the SE
- ROUND 5 SHIPPED (f65cb10, confirm to close): "bigger and no black space" —
  desktop opens punched in at 1.35x, grounds plane doubled and never fades to
  transparent, backdrop is floodlit dark grass (starfield/space gone), zoom
  floor raised so the grounds rim can never be pulled into view
- ROUND 6 SHIPPED (a7cc3e9, confirm to close): practice squad — 4 tiny
  players run staggered shuttle drills on the outer practice field (existing
  walk frames, pure CSS routes, facing flips at the turn)
- ROUND 7 SHIPPED (dd1b9ce, confirm to close): grounds DENSITY after the
  "mid" verdict — 13 tree clusters ring the map, 4 glowing floodlight masts
  at the campus corners, gold goalposts on both ends of the practice field,
  the practice field itself is real turf with end zones, and an asphalt
  access road runs from the parking lot off the grounds
- ROUND 8 SHIPPED (confirm to close): LIVE JUMBOTRON per the external audit —
  the scoreboard was clipping off the right edge on narrow viewports (~114px
  at 1054px wide); moved fully inboard, scaled up to a hero prop, and its LED
  face now burns the club's REAL trophies + fan count (glowing orange rows,
  screen flicker, pop on change). Plus 3 more tree clusters in the audit's
  named dead zones (top-center band, right-center wedge, NW corner)
- Motion ideas still on the shelf: victory dance on the winning squad at the
  whistle, defender knock-back on pancake, ambient birds/steam on the home
  board, deploy-zone shimmer while holding a card, a coach figure watching
  the drills with a whistle beat

## Layout editor (shipped 044ce8d, confirm to close)

- `?edit=1` — drag any board piece (decor, buildings, scoreboard, practice field,
  road) with grid snapping, flip/scale/z controls, duplicate/delete for decor,
  and a COPY LAYOUT CODE button that exports paste-ready coordinates.
  Edits live in localStorage only; reset returns to the shipped layout.
  Workflow: Jumaane arranges → COPY → paste block to Claude → Claude ships it.

## SimCity direction (July 11 — active)

- [x-ish] Living traffic v1 — SHIPPED 0d475f8 (confirm to close): two team-colored
      cars (Gemini, bus-style-ref'd) drive the access road on staggered loops,
      fade in/out at the ends; runs on live board + bigstadium preview
- [x-ish] Campus growth stages — SHIPPED eb2ebae (confirm to close): grounds
      urbanize with the live fan count — 250 vendors / 1.2k fan camp / 5k
      tailgate row / 12k tailgate city; new food-truck + fan-tents art;
      new clubs start with an empty campus (the city is the reward)
- [ ] SimCity menu remaining: city-stats dashboard (fan population/morale/
      revenue advisor panel) · place-your-own decor (buy + place trees/
      banners with coins, editor tech)
- [ ] Growth stage-up moment: no celebration when a threshold crosses yet
      (toast/fanfare/camera nudge to the new props would sell it)
- [x] Size-swap look SHIPPED AS DEFAULT (5078e2a) per Jumaane's "make it live" —
      backdrop stadium (-3.5,5), chalk patch center, Rehab (1,10) + Training
      (10,10) on the apron per his final editor round; ?bigstadium flag retired.
      Still owed: his phone-framing pass on the new default (Safari cache ritual)

## Jumaane's layout live (shipped 3e9d6bd + 5b44ecd, confirm to close)

- Full grounds arrangement from his editor session transplanted verbatim
  (stands, lot, bus-on-road, lights, 14 trees, scoreboard at (3.5,-2))
- Buildings drawn at his spots via HOME_DISPLAY_ANCHORS (home view only —
  his call). Battle geometry in fixedBase untouched.
- Accepted trade-off to revisit if it ever bugs him: Test Defense/raids show
  buildings at their battle anchors, not the home spots. Making them match =
  redesigning walls/slots of all 3 formations around the new anchors.

## QB card + walk feedback round (shipped 4996980, confirm to close)

- QB hero card: ball now IN HAND for the whole cycle (cocks back with the windup,
  launches on the snap), card mirrored so he reads right-handed and throws to the right
- Battle walk stride tightened 0.55s → 0.42s (heroes, guards, troops)
- Note: battle-field walk cycles verified working (all 4 frames cycling); the "feet
  don't walk" read was the CARD idle — card bodies sway/hop but legs hold their pose.
- CARD LEG LOOP — SHIPPED (confirm to close): 2 weight-shift idle frames per hero
  (Gemini, ref'd off each rig body), alternating every ~0.55s through the idle window
  on ALL 9 hero cards. QB's pair regenerated with an arm-lock anchor (arms pinned to
  the reference pose) so the in-hand ball keeps riding his palm through the shuffle;
  windup → throw → follow-through all still land on the beat.
