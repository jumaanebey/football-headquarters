# Stadium acceptance and replay harness

Branch `claude/fhq-stadium-harness` from main `208880b` (PR #86, `codex/stadium-player-performance`).
This package is fixtures, verification and evidence only: it does not change a match rule, a
component, choreography or art, and it does not re-implement any of them. It drives and reviews the
shipped implementation.

Run it:

```
npx vitest run tests/stadiumAcceptance.test.ts   # 92 automated assertions over 13 scenarios
npm run stadium:gallery                          # 53 browser checks; add --shots to capture images
npm run stadium:gallery -- --shots               # writes docs/evidence/stadium/ (76 plays + panels)
npx vite  →  /art/stadium-gallery.html           # the browsable gallery itself
npm run stadium:search                           # re-derive scenarios if the checklist changes
```

Browse `art/stadium-gallery.html?tag=<checklist item>` to see every supported play without
replaying whole games; `?panel=S01&frame=1` renders the shipped Stadium panel mid-decision, and
`?wide=1` lays the cards out for desktop review.

## How a scenario is deterministic

A scenario is a club preset, the single random value that starts the game — which fixes the coin
toss and the seed that shown context derives from — and a list of `(call, roll)` steps. Replaying
one through the shipped reducer reproduces the same game every time, so
`tests/fixtures/stadiumScenarios.ts` states the receiving side, the final score, every event's
action, the points each event scored and the reward **before** the rules are asked anything. The
driver refuses a step naming a call the rules do not offer at that point, so a fixture cannot
silently drift into a different decision.

Scenarios were found by `npm run stadium:search` (seeded sampling over legal calls and rolls) and
then frozen. A rules change that moves any outcome fails the acceptance run with the scenario named.

## Checklist coverage — 27 of 27 items, 13 scenarios, 76 plays

| Item | Scenarios |
| --- | --- |
| Receives first: home / away | S07, S09, S11, S12 / S01–S06, S08, S10, S13 |
| Drive direction: home (towards yard 100) / away (towards yard 0) | every scenario carries both |
| Kickoff return / kickoff coverage | S01–S13 / S01–S06, S08, S10, S13 |
| Return taken the distance | S12 |
| Power run from scrimmage | S06, S09, S10 |
| Short pass (slants) / intermediate (flood) / deep (verticals) | S08, S11 / S02, S03, S10 / S01, S04, S05 |
| Defence: zone / man / stacked box | S03, S05, S13 / S01, S02, S06 / S04, S09, S10 |
| Field goal made / missed | S01 (t2), S02 / S01 (t5), S07 |
| Extra point made / missed | S04 / S05 |
| Two-point conversion made / missed | S11 / S06 |
| Touchdown from the offensive call / from the scoring decision | S03, S04 / S09 |
| Stopped for no gain | S08 |
| Conversion correctly skipped | S13 |
| Outcome win / loss / tie | S11 / S01 / S07 |
| Skip, replay and reload | browser checks below |

### Scenarios the current rules cannot produce

Recorded in `UNSUPPORTED_SCENARIOS` so the gap is explicit rather than assumed covered. None of
these is a defect: each would be a rules change.

| Scenario | Why it does not exist |
| --- | --- |
| Inside versus outside run from scrimmage | Scrimmage runs have one call (`power`). Inside and outside are distinguished only on the kickoff return, where the lanes are left, middle and right. |
| Turnover (interception or fumble) | No resolution changes possession inside a possession; the two-possession contract gives each team exactly one. |
| Safety | The ball never goes behind the possessing team's own goal line, and nothing awards points to the defence. |
| Punt | There is no punt call; a possession that fails to score ends where it stands. |
| Overtime or sudden death | Settled product decision: one possession each, ties are valid. |
| Defensive score | Blocking a kick denies points; it never awards them. |
| Clock expiry | Possessions advance only on confirmed calls, which is what makes a reload safe. |

## Automated assertions — what is proved, not judged

**92 assertions** in `tests/stadiumAcceptance.test.ts`, per scenario:

- **Frozen result.** The receiving side, final score, reward, the action of every event and the
  points each event scored match the fixture exactly.
- **Possession accounting.** Exactly two possessions in the order the toss decided, one per team,
  `possessionIndex` ends at 1, and every event drives the way its possession attacks.
- **Score transitions.** Every event's points are one of 0, 1, 2, 3 or 6; the running score after
  each event equals the event's recorded score; only the side that scored gains; scores never fall.
- **Ball endpoints.** Start and end yard lines stay on the field; a touchdown ends in the endzone
  that possession attacks; a carry never moves against its direction; and each event starts where
  the previous one left the ball unless the possession changed or a touchdown reset it.
- **Result persistence.** At every step, a save round-trip returns a byte-identical game, the state
  still validates, and the pending decision offers the same calls.
- **Reward confirmation.** Collecting pays exactly the stated reward, records one history entry,
  marks the game collected, and a second collect is refused.
- **Choreography agreement.** For every event, Codex's `stadiumPerformance` settles within 1.5
  yards of the endpoint the event recorded — the endzone for a kick, the recorded yard line
  otherwise. This checks their model against the rules; it does not re-implement it.

**53 browser checks** in `npm run stadium:gallery`:

- All 13 scenarios and all 76 plays render a field with a finite camera and a caption.
- Every animating play offers a skip control; skipping jumps to the finished play; a finished play
  offers a replay; replaying restarts and finishes on its own; a page reload renders and settles.
- No console errors while rendering the whole gallery.
- At phone portrait (390×844), phone landscape (844×390) and desktop (1440×900): the document never
  scrolls sideways, no play card is wider than the viewport, every field keeps a usable size, and
  every playback control stays inside the page as a usable tap target.
- The **shipped Stadium panel** (not just the gallery cards) renders at all three sizes with its
  decision on screen, at least three controls, no sideways scrolling, controls at least 30px tall,
  and a field at least 120px high. Once the play settles, the panel states the objective and
  enables its calls.

## Visual judgments — reviewed by eye, not asserted

Against `docs/evidence/stadium/` (76 play images plus panel and viewport captures). These are
opinions, recorded separately from the assertions above.

- **Plays read as what they claim.** A return runs to the yard line named in the caption; a deep
  pass shows the receiver arriving downfield; a power run keeps the carrier between the tackles; a
  stopped play leaves the carrier at the line. Endzones correspond to the sides throughout.
- **Scores land in the right endzone.** In S03 the opponent's touchdown finishes inside the HOME
  endzone with the carrier in away colours; in S12 the home return finishes in the AWAY endzone.
- **Made and missed kicks are distinguishable but subtle.** A made kick finishes high near the
  crossbar, a miss finishes low and past it. The difference is a few pixels of height plus the
  caption; there is no explicit wide/short cue. Acceptable, worth knowing.
- **Long returns look lopsided.** On a return of 25 yards or more the blockers and pursuit remain
  bunched near the origin while the returner is alone in frame (S07 play 4). It reads as a clean
  break, but the supporting cast does not travel.
- **The panel is legible at every size.** Phone landscape puts the field beside the decision text,
  which is the best of the three layouts.

## Findings

### F1 — a named player's stat chip shows the team average, not that player's stat

**Severity: medium.** The attribution chips under every result name an individual and print a
number that is the *selected team's* mean for that attribute, not the named player's.

*Where:* `actorFor` in `game/stadiumFootball.ts` computes `value` from `ratings.speed | power | iq`
(team means from `lineupRatings`) for the `speed`, `power` and `iq` attributes. Only `overall` uses
the player's own figure.

*Reproduce:* `npx vite`, open `/art/stadium-gallery.html?tag=pass-deep`, scenario S01 play 5 — the
chip reads `Ace QB · QB · iq 13`. That quarterback's own IQ is 22. Measured across scenarios:

| Chip shown | That player's own value |
| --- | --- |
| `Ace QB · QB · iq 13` | 22 |
| `Island · CB · speed 13` | 22 |
| `Speedy · WR · speed 13` | 18 |
| `Crusher · DL · iq 13` | 10 |
| `Viper · S · overall 40` | 40 (correct) |

*Effect:* the feature's purpose is to say who decided the play and with what. Printing one shared
number under different names undercuts that, and reads as a bug to anyone who knows their roster.
Every chip in a game shows the same three values.

*Not fixed here:* this lives in the rules module, which this package does not modify. The change is
small — read the attribute from the snapshot player rather than the team rating — but it alters
event payloads, so it belongs to whoever owns those rules.

### F2 — during the opponent's possession the field-position line reads as the player's own drive

**Severity: low, copy.** On the opponent's scoring decision the panel shows, under "Their
possession", the line `43 yards to the endzone from your 43.` Both halves are individually true —
the opponent is 43 yards from the home endzone, and the ball is on the home 43 — but "yards to the
endzone from your 43" reads as though the player's team is driving.

*Reproduce:* `npx vite`, open `/art/stadium-gallery.html?panel=S01&frame=1`, click **Skip
animation**. Captured at `docs/evidence/stadium/panel-phone-landscape.webp`.

*Suggested wording:* "They are 43 yards from your endzone, at your 43." Owner: whoever owns the
context line in `components/StadiumFootball.tsx`.

### F3 — 60-plus yard field goals are offered as an ordinary option

**Severity: low, design observation.** In S01 the panel offers "Kick a 69-yard field goal" with the
detail "Three points if your kicker has the range", at roughly a 3% chance. Nothing marks the
attempt as out of range.

*Reproduce:* `/art/stadium-gallery.html?tag=kick-missed`, S01 play 6, captured at
`docs/evidence/stadium/S01-5.webp`.

### No failures found in

Possession accounting, score transitions, ball endpoints, result persistence, reward confirmation,
viewport fit, and skip/replay/reload. All 92 assertions and 53 browser checks pass on `208880b`.

## Limits

- Everything here is local and headless: HeadlessChrome 152 on macOS, no throttling, no physical
  device, no live server (no account is created and no authority request is made).
- The gallery renders the shipped components with the app's stylesheets, which is close to but not
  identical to the panel's placement inside the campus screens.
- Visual judgments are one reviewer's opinion against captured stills, not motion review or player
  testing.
- Scenario discovery is a seeded sample, not a proof: it demonstrates that each checklist item is
  reachable, not that every reachable outcome is catalogued.
