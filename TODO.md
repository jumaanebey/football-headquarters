# Football Headquarters — TODO

Running task list. Rules (per ~/CLAUDE.md): only mark complete when Jumaane confirms;
never delete incomplete tasks.

## Open — from the July 2026 full review

- [ ] **Early-base defense balance** — L1 Sandlot bases can lose ~48% ground mid-drive in
      Test Defense. Expected at that level, but watch that new players don't feel hopeless
      before their first upgrades land. Candidate levers: soften bot raid `extras` at tier 0,
      longer starter shield, or a gentler first-week attacker pool. Needs playtest data
      before tuning (ties into the existing ladder win-rate watch below).
- [ ] **Formation unlock timing** — Cover 3 gates at Stadium L3, Max Protect at L5. If
      formations should feel like a *choice* (identity) rather than a progression unlock,
      surface all three as selectable from L1 and let the 9-slot emplacement ladder +
      mastery carry progression instead. Decision needed from Jumaane before implementing.

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
- [ ] Coach portrait preload (empty circles flash briefly on first open)
- [ ] README screenshot is stale
- [ ] Sound: game is near-silent (synth sfx only) — music/crowd loops are a bigger juice
      win than remaining art; needs a music tool, not Antigravity

## Art (Antigravity — pipeline closed unless ordered)

- [ ] Rank crest set (8) — biggest remaining art win (ladder uses emoji today)
- [ ] Victory/defeat verdict card art
- [ ] Rival crest set (6–8) for season/raid opponents
- [ ] Loading/splash art (needed for App Store build anyway)
- [ ] Launch round: app icon variants + App Store screenshot frames
- [ ] Hero ability icons (9) — currently emoji, fine until Phase C says otherwise
