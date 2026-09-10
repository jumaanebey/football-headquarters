# Phone play and defense clarity — September 10, 2026

## Delivered behavior

All five building taps open the same compact entry panel. Overview shows the facility's current output/status and primary navigation/collection action; Upgrade shows exact Coins or Crowns, the next benefit and builder availability; Building styles previews one era at a time. Scouting enters through this panel and then opens the full prospect workspace. Long-form roster/scouting workspaces are separate from the initial building view. Scrolling remains available as an accessibility fallback if enlarged text exceeds the viewport.

Equipment prices and extra-slot prices spell out Coins and Crowns. Daily Practice rewards and its six-Crown sweep bonus spell out Crowns. Coin collection uses a single explicit pill, with drawn HUD and flying icons instead of rectangular bitmap artifacts. Selecting facility artwork still opens its panel; the collection pill collects.

Installed web app manifest requests landscape. Settings offers full screen and orientation locking when supported, with manual rotation instructions on unsupported/rejected requests. No forced CSS rotation and no claim that iOS/Android physical acceptance has been completed.

Defense visuals distinguish footballs, flags, shirts, water spray and sled impact. Sleds no longer fall through to the football renderer; coolers spray water into the existing puddle effect. These are presentation changes. The combat/server rules and damage timings are unchanged. The workshop explains actual range, nearest-target, splash and slow counters; it does not invent a position-specific multiplier.

Club colors offer four original palettes, an initialed crest, and home/away end-zone colors. Preferences are local to the device and club name. Battle mode badges distinguish Season, Rival game, Gauntlet, Defense test and Practice. This is an identity foundation, not a delivered uniform/hero skin system.

## Verification

Strict release verification, including authority parity, tests, asset validation, build and balance guard. Two added rendering regressions cover non-football effects and staggered/expired shots.

Full app with existing protected Campus QA FC: all 5 facilities × 3 sections at 390×844 and 844×390; content fit with no body scrolling in all 30 checks. Additional screenshot and DOM dimension check confirmed the actual active phone viewport. Currency labels and disabled insufficient-Coins upgrade were inspected; no upgrade, recruit or reward was purchased/claimed. Daily rewards explicitly showed 4, 5, 8 and the 6-Crown sweep. Redline crest and field color persisted through reload, then Harbor was restored. A free defense test rendered at an actual 844×390, was ended and returned to base; no resources were spent. The equipment effect gallery rendered the same DefenseShot component used by battle. Physical orientation lock, installed-device acceptance and the native Chrome offline/transfer corpus remain separate evidence.

## Next defense milestone — not delivered here

The user's requested depth requires an explicit counter system, not more projectile variants. Preserve existing currency balances and purchased equipment while versioning the combat rules.

- JUGS: sustained single-target pressure. Blockers protect vulnerable skill players; threat selection must be visible.
- Sled: short-range displacement and lane obstruction. Heavy OL/TE resist displacement; ranged QB/K can attack outside reach.
- Ref: timed route/throw disruption, with a visible warning window. IQ/discipline provides a measurable response; do not make an unavoidable all-purpose stun.
- T-shirt cannon: crowd control against stacked formations. Split deployment and spacing are the counter; area damage must fall off away from the center.
- Water station: temporary terrain hazard. Slow/control rather than an implausible thrown cooler. Cleat/traction traits and alternate routes counter it; avoid applying the same slow equally to every role indefinitely.

Before production: implement one shared role/equipment interaction table in the deterministic engine; render effects from the same outcomes; show strengths, resistances, durations and cooldowns in prep and debrief; run a fixed-seed matrix across all offensive roles and equipment levels, with mixed squads and placement controls; verify replay parity, old-film compatibility and exactly-once server settlement; deploy the matching authority version before enabling the new client rules. No player should buy equipment based on an unimplemented counter claim.

Uniforms, team crests with authored art, coordinated equipment liveries and full game-mode environments remain a separate skin-art milestone. Current palette selection must not be described as that milestone's completion.
