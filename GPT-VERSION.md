# Football Headquarters — GPT version

A separate implementation branch of the existing game. This version preserves the
campus arrangement, facility progression, roster, heroes, campaign, away games,
Gauntlet, defense schemes, and Supabase integration.

## What changed

- Rebuilt the club HUD with named resources, a rank progress strip, and a direct
  entry to the club overview. Mobile uses a separate resource row.
- Replaced the floating unlabeled football action with a keyboard-accessible Game
  Day button in a consistent five-item navigation dock.
- Redesigned the club overview around the current stadium's real progression art,
  club power, campus growth, competition, and team readiness. Existing roster,
  Game Day, and defense actions are reachable directly from this view.
- Increased checklist text sizes, kept the mobile collapse preference, and made
  preference storage resilient to unavailable browser storage.
- Added dialog names, keyboard focus containment, focus restoration, and labeled
  close controls to the shared sheet component.
- Deferred the battle renderer until entering a game; moved the large inline
  animation stylesheet into a bundled, cacheable file.
- Added React 19 declarations and Vite environment types. Fixed the existing
  inferred rival-building array type and React JSX namespace references without
  changing simulation rules. Added a repeatable typecheck/test/build command.
- Stopped portable save files from carrying authentication and refresh tokens.
  Legacy backups can still restore progress but cannot replace the current login
  or player identity. Reconnect an online club by signing in on the new device.
- Added checks for production image references and every building/unit/defense/rank
  resolver, plus backup credential exclusion tests.

- Added an original Game Day tunnel illustration, generated with the built-in
  image tool. It loads in the Game Day selector, not on campus startup. Existing
  gameplay sprites are retained. See `art/gpt-game-day.md` for the art brief.

## Validation

Run `npm ci` and `npm run check`. This runs TypeScript, the gameplay/geometry and
regression tests, and the Vite production build. Existing engine tests pass.
Browser interaction, visual layout, and live Supabase authentication have not been
verified in this environment. The change does not require a database migration.

## Review focus

On a phone, open the club overview from the name at the top, open each navigation
item, and launch a campaign game. Check roster training, facility upgrades,
recruiting, and a returning save. Use Tab/Shift-Tab inside a sheet and Escape to
close it. The campus layout and game balance should match the original version.

The large state/controller module in App.tsx remains a follow-up architectural
opportunity. This change intentionally isolates presentation and loading changes
instead of replacing a working simulation or migrating save schemas wholesale.

## Deeper engine pass

The campus transition, initial club factory, defense-layout adapter, save migration,
and save validation now live in `game/` instead of the React root component.
`advanceCampus(previous, now)` is a deterministic transition with no timers,
browser storage, sound, or React state setters. This allows direct regression
checks against the rules that run in the playable game.

- Movement lands exactly at its target instead of oscillating after overshoot.
  Resuming a suspended tab banks timed progress while limiting visual movement.
- Hidden tabs stop campus updates and catch up when visible again.
- Upgrade celebrations run after committed updates, with timer cleanup.
- Fresh clubs no longer share nested roster objects.
- Invalid local saves stop boot before autosave starts. Recovery can download the
  original data, restore the last readable boot backup, or explicitly archive it
  and start fresh. Imported and cloud saves are validated before replacement.
- Existing save fields still migrate; the save key is unchanged. Browser storage
  being unavailable still permits guest play.

The three attempted starter-facility image replacements were rejected: the image
output contained baked checkerboard backgrounds without alpha transparency and
was 1254×1254 instead of the requested 1024×1024. They are not in the game or this
branch. The prior original Game Day illustration remains included. The building
sprite refresh is unfinished; existing working sprites remain in use.

`scripts/check-sprites.py` checks sprite dimensions, alpha, and transparent corners
before integration. It correctly rejects those outputs. It requires Pillow, as
do the existing art tools. Run `python scripts/check-sprites.py <sprite.png>`.

## Hero and placement pass

Reviewed `DESIGN-BIBLE.md`, `HERO-SPRITES.md`, `FIXED-BASE-PLAN.md`,
`ART-DIRECTION.md`, and the later handoff/layout notes. No separately named PRD
was found in the repository. Original hero identities and the exported home
layout remain canonical.

- Hero guards now resolve WebP portraits to their complete walk cycles.
- Shared `SpriteFrames` waits for every pose before hiding the portrait. Failed
  loads retain the portrait; walk/action changes reset readiness together.
- Four stride frames switch discretely without blended poses. Reduced motion
  hides the sequence and displays the original character.
- Campus and battle facing use projected isometric travel, including movement
  along world Y. Battle attacks also face their target.
- Hero cards retain their body when the action image is unavailable, and show a
  single static body with reduced motion.
- Battle health bars overlay actors instead of changing their height and moving
  their ground position when damage starts.
- Facility hitboxes retain their existing footprint alignment and now have
  keyboard activation, visible focus, and facility/level labels.

Validation: 64 tests, TypeScript and production build pass. Complete dynamic
hero/player walk cycles, idle frames and action asset paths are checked.
`npm run balance` passes every documented assertion. Its diagnostic scenarios
still show an Epic squad underperforming a Common squad on one layout and no QB
advantage on another; these are playtest targets, not proof of broad imbalance.
Combat rules were not retuned from those isolated scenarios.

Still incomplete: desktop/phone visual and interaction checks, live cross-device
cloud-save verification, and the three starter-facility replacements. The browser
explicitly rejected the authorized preview URL under its security policy. A
single background-removal edit per building again returned opaque RGB exports
with baked checkerboards; those candidates were excluded. No browser pass or
finished building-art refresh is claimed.

## Observed movement follow-up

Battle animation now uses observed displacement from each simulation step, rather
than assuming every non-attacking character is walking. Waiting defenders hold
still, stride tempo follows actual speed, and walk/lunge loops stop at the result
screen. Ordinary defenders use their existing four-frame walk art; hero defenders
use their existing action poses during contact. Small steps use velocity for
facing, avoiding a direction threshold that ignored slow runners. Campus players
keep their last facing when stopping or moving vertically on screen.

These fields are presentation-only: no combat stats, paths, random draws or
replay actions change. Four new movement tests bring the suite to 68 tests.
A further headquarters revision from the original transparent sprite also failed
alpha validation (RGB, 1254 square, baked checkerboard) and was excluded. Built-in
image generation was used; the prompt preserved the original canopy, table,
playboard, football crate, flag, camera and footprint while requesting crisper
edges and genuine alpha. No new gameplay bitmap was integrated.

## Unified field and hero art presentation

The home campus now uses continuous gradient turf instead of repeated diamond
bitmaps and per-tile shading. Removed the bright campus perimeter seam and matched
the lawn edge to the surrounding grounds. Home practice and battle fields share
`FieldPaint`: one turf palette, a 100-yard playing surface, two 10-yard end zones,
five-yard lines, hash marks and a stronger midfield line. Existing field bounds,
building positions and combat geometry are unchanged.

Buildings no longer breathe or lift on hover; tighter contact shadows and modest
saturation reduction help their existing artwork sit on the turf. Hero walk/action
frames receive per-image vertical placement offsets measured from their alpha
silhouettes so their visible lower edges share a baseline. Card poses use the same
alignment except QB/kicker rigs, whose hand/ball attachment geometry is preserved.
Idle card layers stay hidden until both images have loaded.

`scripts/measure-hero-feet.py` inspects original images and emits the placement
metadata in `game/heroFootOffsets.ts`; it does not edit any bitmap. This pass improves
native field rendering and how existing art is presented, rather than claiming new
transparent replacement art. TypeScript, 68 tests and the production build pass.
Browser visual acceptance remains blocked and is not claimed.

## Recreated heroes integrated with animation

New generated six-pose sheets for Franchise, Enforcer and Dr. Sloane now render in
hero cards, live battles and home-campus patrols. Each sheet contains idle, four
walk poses and an action pose. Movement selects walking; stops select idle;
attacks and ability activation select the action beat. Hero cards demonstrate the
sequence. Home heroes respect unlock state and open the Heroes screen on tap.

The sheet renderer removes a deliberately magenta production backdrop once per
loaded sheet, caches the result, aligns per-cell lower bounds, and corrects QB
frame facing. It retains legacy art if loading or Canvas access fails. Reduced
motion uses the idle pose, hidden tabs skip drawing, and component teardown
cancels animation callbacks. New art is limited to these three approved redesigns;
the other six heroes retain their existing art and animation.

The approved campus illustration appears as a thematic backdrop in the mature
club overview (stadium level 9+). It is not substituted for the interactive campus:
that still uses live buildings, progression, selection and the shared field paint.
Individual recreated building sprites remain outstanding. Some generated stride
poses are close together; browser visual/motion acceptance remains unverified due
to the previously reported preview security block. No full rebuild completion is
claimed. TypeScript, 71 tests and production build pass.

Art: built-in imagegen, one sheet per hero, referenced the approved three-character
concept. Prompt required 3 columns × 2 rows, uniform full-body scale, original
face/costume, sculpted cel style, left-facing idle/walk/contact-action sequence,
flat magenta, no shadows/text/grid lines. All outputs are 1536×1024. Production
files: `public/assets/gpt/heroes/{qb,enforcer,medic}-motion.png` and
`public/assets/gpt/campus-vision.png`.

## Continuous hero drills and full unlocked campus roster

Campus patrols now update positions each animation frame without re-rendering the
React tree at that rate. All unlocked heroes participate, using the three modern
sheets where available and complete legacy walk/action sequences for the other
six. Nine separate lanes stay inside the field; three run tempos stagger the
athletes. Each run ends in an action beat, recovery and a return run, retaining
facing until the turn. Campus hero markers are larger and remain tappable.

Reduced motion holds position and idle facing. Hidden tabs pause patrol and sheet
playback instead of jumping ahead on return. Modern action sequences return to
idle between contact beats; malformed stride durations have a safe fallback.
No combat rules, progression or building placement changed.

Validation: 74 tests, production build and TypeScript pass. Browser visual
acceptance remains outstanding; no new character artwork was generated this pass.

## Battle hero contact and status pass

All nine hero rigs now share one battle presentation component on both teams.
Throw/contact poses follow the existing yardage/projectile release beat, recover
to idle, and yield to running when the hero moves again. Ability poses also work
for the legacy six heroes, and every hero holds idle when the game ends.
Presentation timers do not change yardage, targets, combat RNG or replay inputs.

The redesigned canvas heroes now retain Blitz, healing, shield and hit-flash
filters. Defender uniforms retain their team tint. Running sheets accumulate
normalized stride phase, so speed changes adjust cadence without skipping to an
unrelated foot pose. Reduced motion explicitly disables modern idle breathing.

Validation: TypeScript, 78 tests and production build pass. Browser visual review
and new artwork for the remaining six heroes/buildings remain outstanding.
