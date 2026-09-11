# Connected club milestone — Claude handoff

Branch `claude/fhq-connected-club` from main `4f6357d`. Packages A (lineup), B (two-possession
Stadium) and D (authority, compatibility, verification) are delivered here. Package C
(development and scouting) is deliberately deferred to a separate additive PR, which the handoff
permits, so the first coherent integration is not held up.

Nothing is deployed. The contract Codex builds against is `docs/CONNECTED-CLUB-CONTRACTS.md`.

## What was wrong, reproduced in code

The two evaluation files named in the assignment (`FHQ-DEEP-PRODUCT-EVALUATION.md`,
`FHQ-PRODUCT-PROBES.json`) are not in the repository or on this machine, so each finding was
reproduced from the source instead:

| Finding | Where it lived |
| --- | --- |
| Reserve dilution (Attack 62 → 58 after signing a weaker athlete) | `footballRatings` averaged **every** roster player per unit group, so any signing moved the rating |
| Identical normal return lanes across 1 000 matched probes | the lane value entered the formula only inside the `advantage > 1.05` breakaway branch; the ordinary return computed `23 + advantage*12 + speed*.2 + roll*12` with no lane term at all |
| A kick decided by an unrelated average | the field goal read `r.iq`, the mean IQ of the whole roster |
| A long-field attempt labelled a goal-line play | the `finish` phase always offered "Go for the touchdown … against their goal-line front", whatever the yard line |
| No event geometry | events carried `yards` only; the renderer inferred possession from phase names and placed the ball with fixed coordinates |

Training cost parity, the four mandatory contacts and the nine-minute schedule ceiling belong to
Package C and are untouched here.

## Package A — active lineup and reserves

`game/lineup.ts`. Nine slots across the four unit groups (three skill, two line, two front seven,
two secondary), so the ten-player starting roster fields a legal team with one reserve.

- **Only selected players rate.** Offensive slots produce `attack`, defensive slots `defense`,
  and speed/power/iq are means over the selected nine. Signing a reserve cannot move them.
- **Preview equals settlement.** `compareLineupChange` and the reducer both call `lineupRatings`,
  so a replacement moves the rating by exactly the advertised delta.
- **No club is bricked by a missing position.** Each slot declares a fallback order over the other
  unit groups; a player filling a slot from another group is reported `outOfPosition`, not refused.
  A slot stays empty only when literally no player remains, and that is a stated blocker.
- **Deterministic migration.** `selectLineup` fills the scarcest slots first, prefers the named
  role, then the stronger player, then the lower id. The saved roster is never reordered or
  filtered. `repairLineup` keeps every still-legal choice and names the slots that moved.
- **One persistence route.** `{ type: 'lineup.set', lineup }` through the existing authority
  pipeline; the reducer refuses unknown or duplicated ids, foreign players and extra keys.
  Releasing a starter repairs the lineup and returns `repaired` so the UI can say what changed.

## Package B — two-possession Stadium

`game/stadiumFootball.ts` (v2), with pre-rewrite games kept on the frozen
`game/stadiumFootballLegacy.ts`.

- Each team gets one possession and both run the same sequence: field position, an offensive
  choice against a shown defensive context, a scoring decision, and a conversion only when it can
  still change win, tie or loss. The player calls every step on whichever side of the ball they
  are on. Ties stand; a go-ahead second-possession touchdown that puts the result beyond any
  conversion ends the game at once.
- **Lanes are decisions.** Coverage is shown before the choice and each lane answers it: into the
  soft side gains materially more than into the strength on the same state and the same roll, and
  only a balanced look makes the lanes equal — which the copy says.
- **Attribution.** Matchups read the lineup snapshot captured at kickoff. The kick is taken by a
  named selected player. A later roster change cannot reach a pending game.
- **Geometry.** Possession, direction, start and end yard line, action kind and points are
  persisted on every event; `StadiumSequence` renders those rather than fixed coordinates, on a
  shared 0–100 field with opposite endzones and scores placed in the attacking endzone.
- **Copy tells the truth.** `stadiumObjective` derives from the score ("A field goal ties; a
  touchdown wins."), and a 55-yard attempt is never called a goal-line play.

## Package D — authority, compatibility and verification

- Server bundle regenerated; **`club-authority.v9.min.js` staged** (sha256 `3e904d7f490a…`) and
  recorded in `supabase/recovery/deployed.json`. Deployed **v8** (`9456bd85a269…`, rules
  `raid-tactics-5`) is untouched and remains the rollback target. `npm run authority:build --check`
  reports parity holding with the deployment lagging. **Nothing was deployed.**
- Raid rules are unchanged: the eight-match corpus reproduces its committed hashes under the same
  `COMBAT_RULES_VERSION`, so `hero-actions-3`, `defense-counters-4` and `raid-tactics-5` films
  remain supported.
- Compatibility proved by test: a save without a lineup migrates identically on every load without
  mutating the roster; a lineup naming a missing player is refused and repairable rather than
  fatal; an in-flight development schedule still settles on the clock; a repeated `lineup.set`
  applies once and returns the original receipt; accounts keep their own lineups and cannot name
  each other's players; a started Stadium game survives a save round-trip; and a pre-rewrite
  Stadium game is still valid, playable and collectible under its own frozen rules.
- Scenario tests state their expected outcome before calling the code under test — the lane
  comparison names which lane must gain more, the objective tests assert exact sentences, and the
  field-goal distances are arithmetic (20 yards to the goal + 17 = 37), not a second call to the
  helper.

## Verification

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **734 tests / 93 files** pass |
| `npm run authority:build -- --check` | parity holds; v8 deployed, v9 staged |
| `npm run release:verify` | **11/11 offline checks pass** in 53 s |
| `npm run release:verify -- --browser` | Chrome determinism corpus passes; the startup budget step fails |

**The startup budget failure is pre-existing on main and not caused by this milestone.** Running
the same check on unmodified `origin/main` produces byte-identical failures:

- `roster` 1.19 MB against a 0.80 MB budget, entirely `indoor-atlas-v1-*.webp` (1 218 KB), which
  the Roster screen loads.
- `first-deployed-hero` 10.41 MB against a 6 MB budget: four heroes' authored sheets
  (~2.7 MB each) now load when the deployment taps put them on the field.

Neither budget was touched here. The second one needs a decision rather than a number: either the
budget is restated for the number of heroes a deployment draws (measured at 7.5 MB for two, and it
scales), or the authored battle sheets get the derived alpha treatment already measured at
**39.77 MB → 5.96 MB**, which needs art review.

## Limitations and remaining dependencies

- **Package C is not started.** Training cost parity, away schedules beyond minute-scale queues
  and the four-contact recruitment checklist are unchanged.
- **No live or preview evidence.** Everything above is local: no account was created, no live
  settlement was exercised, and no deployment was made. `npm run authority:evidence` and the
  browser journey remain owner-run.
- **v9 is staged, not deployed.** Backend-dependent client controls must not go live before the
  compatible authority is deployed; Codex coordinates that release. v8 and every earlier artifact
  are intact as rollback targets.
- **Codex call sites.** Only the roster screen needs one: `lineupView` / `compareLineupChange` and
  the `lineup.set` action, exactly as written in the contract document. The Stadium needs none —
  component props are unchanged.
