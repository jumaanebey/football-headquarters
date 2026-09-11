# Claude Code handoff — Football HQ connected club milestone

Owner: Jumaane. Prepared September 11, 2026. Start from current main; reviewed baseline is 4f6357d (PR83). Read your checkout's handoff and current PRs before editing. Codex's separate checkout is under Documents/Codex/2026-09-09/create-an-image-of-4/work/football-headquarters. Do not change that checkout, its servers, or its worktrees.

## Objective

Make recruiting, development, lineup selection, and Stadium competition form a coherent player journey. Deliver real decisions and attributable outcomes, preserve saved clubs and exactly-once server settlement, and provide an integration-ready rules package. Green CI alone is not completion.

Read the adjacent FHQ-DEEP-PRODUCT-EVALUATION.md and FHQ-PRODUCT-PROBES.json. The findings include reserve dilution (sample Stadium Attack62→58 after signing a weaker athlete), identical normal return-lane outcomes in1000 matched probes, whole-team and subgroup training with identical8Energy/60s cost, four mandatory recruitment contacts totaling100interest, and schedules limited to at most9minutes atL1.

## Settled product decisions

- Stadium has exactly one possession for each team; ties are valid. Do not add sudden death or an NFL overtime clock.
- Raids use group deployment and tactical orders. Preserve shipped raid-tactics-5 films and earlier supported versions.
- Scheduled development and scouting continue while closed. Games/raids only advance with the player present.
- Coins and activity-based scouting reveal different prospects. Preserve stronger starting attributes for the agent path and greater growth potential for the development path.
- Preserve approved artwork. No regenerated art, new dependencies, credential storage, account cleanup, or unrelated infrastructure work.

## File ownership — prevent the previous collisions

Claude owns: new game/lineup.ts; shared types/save validation and authority action/service changes needed for these packages; game/stadiumFootball.ts; components/StadiumFootball.tsx and components/StadiumSequence.tsx; their dedicated new stylesheet if needed; game/development.ts and game/scouting.ts when working on the later rules packages; relevant tests, evidence scripts, authority artifact tooling and package-specific documentation.

Codex owns: App.tsx, game-theme.css, IsometricMap and campus components, ClubDashboard, SquadModal, WeightRoom/WeightRoomScene, FacilityInterior/FacilityUpgrade/CampusDepartment, DevelopmentPanel, ScoutingActivities, PracticeField, indoor player presentation, navigation, and new read-only presentation models under game/presentation/.

Do not edit Codex-owned files. If a caller must change, provide the exact required call site and a small example in the integration note. Codex will make it. Do not cherry-pick Codex changes or replace their implementation in your checkout. Put Stadium styles in your own imported stylesheet so neither of us edits game-theme.css concurrently.

## Package A — active lineup and reserves (first dependency)

1. Add an explicit Stadium lineup with role/group slots and reserves. Define a practical short-format roster requirement using available role types; do not make old clubs unplayable because a rare position is absent.
2. Old saves without a lineup get a deterministic legal starting selection. Use stable tie-breaking and exclude reserves from rating averages. Never reorder or delete the saved roster to select a lineup.
3. Signing a reserve must not weaken the selected team. Replacing a starter must produce the exact advertised rating difference. Removing a selected player must repair/require repair clearly; no silent invalid lineup.
4. Validate duplicate ids, unknown players, wrong roles, missing slots and out-of-date actions. Snapshot the selected lineup in a started Stadium game so later roster changes cannot alter a pending game.
5. Provide a pure read model exported from game/lineup.ts. It should expose slot id/label, selected player id, eligible candidates, reserves, validity/blockers, active team ratings, and before/after comparison for a proposed replacement. Use one authoritative implementation for preview and settlement.
6. Provide a typed lineup action through the existing authority pipeline and document the exact payload. Do not invent an alternate direct persistence route.

Deliver docs/CONNECTED-CLUB-CONTRACTS.md in your first reviewable commit with the exported names/types and action schema. This is the integration boundary. Codex's roster UI will consume the actual contract once available; it will not ship pretend local-only lineup controls.

Acceptance: same club before/after reserve signing unchanged active ratings; replacing a starter matches preview; reload/account switch retains the right owner's lineup; forged ids/duplicate players refused; old save migration deterministic; pending game retains its original lineup.

## Package B — meaningful two-possession Stadium

1. Replace cosmetic normal return lanes with visible coverage information and real lane tradeoffs. Use deterministic state and seeded randomness. Matched-state tests must distinguish lane choices where the displayed coverage differs.
2. Give both possessions the same readable progression: kickoff/field position, offensive choice against defensive context, remaining scoring decision where appropriate, conversion only when meaningful, result. Vary receiving order deterministically or with a persisted coin-toss result; avoid introducing an extra compulsory prompt purely for ceremony.
3. Preserve the simplified format. Once the second team's go-ahead touchdown makes the outcome final, finish immediately. Retain conversions when they determine win/tie/loss. Allow ties after the two possessions.
4. Show situational objectives: e.g. 'A field goal ties; a touchdown wins.' Final copy derives from score/outcome, never generic tie text on a loss.
5. Use selected players in relevant matchups. Display names/roles and which attributes/plan/mastery contributed. Avoid resolving a kick solely from an unrelated full-roster average.
6. Calls must have real alternatives and feedback: successful execution, short gain, incomplete/failed execution, and possession-ending outcomes as appropriate. Do not label a long-field rushing attempt a goal-line play. Turnovers/safeties may be implemented only with complete possession/scoring/validation treatment; do not add a superficial label that breaks the two-possession contract.
7. Persist sufficient event geometry: possession side, direction, start/end yard lines, scoring/action type. Render that event data; do not infer ball position from hard-coded animation coordinates. Use opposite endzones for the sides and keep touchdown placement aligned with the stated yard line.
8. Keep App integration minimal: existing component props where possible. Put any additional required callbacks/types in the contract document for Codex.

Acceptance matrix: receive first/second; home0/3/6/7/8 against opponent0/3/6/7/8 where reachable; go-ahead second TD; failed PAT; a two-point attempt affecting tie/win/loss; weak/equal/strong matchups; each legal call exercised; different lane coverage; field-goal distance and animation agreement; reload every phase; repeated call/collect; concession; no advancing from elapsed time alone.

## Package C — development and scouting rules after A/B contracts

Develop a bounded design note and implement within existing product intent; keep economic changes explicitly documented with before/after fixtures.

- Training: give smaller groups a defensible focus/capacity advantage rather than making whole-team training dominate at equal cost/time. Quote actual group size, affected players, cost, duration, gains, caps and blockers through a pure helper. Avoid arbitrary opaque boosts. Separate busy athletes from available lineup members if overlapping competition is supported; protect snapshots and do not allow one athlete to train and play simultaneously.
- Longer away schedules: support a finite useful away plan rather than only minute-scale queues. Preserve short active sessions. Provide quote/result tests for short visits, a30-minute absence and an8-hour absence. Do not create unbounded free farming or silently change the existing collector economy. Any collector proposal is a separate measured recommendation.
- Scouting: replace the identical mandatory four-contact checklist with prospect-specific readable needs and at least two valid recruitment paths. Preserve paid-agent versus developed-prospect distinction. Show interest and revealed fit; no random reroll dropdown. Give Codex read models for relevant activities, gains, duration and signing requirements.
- Preserve existing in-flight schedules, trips and contacts on deployment. Version or migrate only with explicit fixtures proving accrued progress and paid costs survive.

If completing this package would delay A/B, deliver A/B first, then a separate additive PR for C. Do not hold the first coherent integration hostage to speculative expansion.

## Package D — authority, compatibility and verification

- Production currently uses authority v8 supporting raid-tactics-5 plus earlier versions. Read current recovery/deployed manifest rather than trusting this snapshot if main advances.
- Update server rules/artifacts with existing tools. Prove old reservations, saved games, schedules and replays remain usable. Never replace supported old raid rules with modified semantics.
- Add independent scenario expectations: define expected outcomes before calling implementation helpers. Avoid tests that always choose footballCalls(game)[0] or calculate their expected result with the same helper under test.
- Include raw evidence for reserve selection, branch decisions, migration, duplicate retries, account scope, save/reload and rollback compatibility. Clearly distinguish local, preview and live evidence.
- Run appropriate typecheck, full tests, release verification, artifact/parity and existing deterministic replay guards. Record commands, commits and results.

## Delivery and integration

Work on your own named branch. Provide reviewable commits/PRs, green exact-head CI, the contract document, and docs/CONNECTED-CLUB-CLAUDE-HANDOFF.md listing exports, App call sites, migration/version impact, verification evidence and any remaining limitation.

Do not merge or deploy independently during this coordinated milestone. Codex will integrate both owned workstreams, render the complete journey, and coordinate one release. Backend-dependent client controls must not go live before compatible authority is ready. Keep old rollback artifacts intact.

Do not say the full project is complete when only your package is delivered. 'Done' means each specified scenario is evidenced and every remaining dependency is clearly handed over.
