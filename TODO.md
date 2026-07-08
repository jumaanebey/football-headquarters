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
- [ ] Sound: game is near-silent (synth sfx only) — music/crowd loops are a bigger juice
      win than remaining art; needs a music tool, not Antigravity

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
- [ ] Drive meter milestone pulses at 25/50/75/100%
- [ ] Hero ability cast — screen-edge flash in the hero's color when an ability fires
- [ ] Sheet/modal entrances — slide-up + backdrop fade (they currently pop)
- [ ] Board walkers — upgrade from position-group singles to hero walk frames where the
      walker is a hero; add stop-and-idle pose
- [ ] Upgrade-complete celebration — building pop + spark burst at the building itself
