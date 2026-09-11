# Football HQ — football movement reference and implementation brief
Prepared 2026-09-11. Research notes and proposed design; no product deployment in this research pass. Sources below were read as text. Linked footage is a viewing queue, not claimed frame-by-frame analysis. Timing values are proposed animation targets, not measured athlete biomechanics.

## What the current implementation actually does
PracticeField renders FootballPlayView, which references unitPlayerSprite. StadiumSequence also references unitPlayerSprite. The visual gap is therefore not simply missing asset reuse. Stadium translates ten offensive sprites by 0.82 of ball displacement and eleven defenders by 0.55, arranging them in repeated rows. There are no individual blocking, receiving or pursuit assignments in that presentation. Practice itself uses limited static poses, so copying its animation would not deliver the requested expressiveness.

Keep the approved character silhouettes, scale relationships and uniform identity. Extend that artwork with football action poses. Never call moving a static cutout a finished running animation.

## Sources and movement identities
### Devin Hester — return specialist
Bears special-teams coordinator Jeff Rodgers describes setting up blocks, anticipating the next defender and changing tempo before accelerating into a gap. Source: [Bears coaching assessment](https://www.chicagobears.com/news/rodgers-calls-hester-best-that-s-ever-done-it-19976884).
Design interpretation: secure the catch, gather, draw pursuit toward a blocker, plant, accelerate through the seam. Show blockers creating the opportunity and defenders changing pursuit angles. A contained return still uses this identity; elite movement must not imply an automatic touchdown.
Footage queue: [Every Bears touchdown return](https://www.chicagobears.com/video/every-devin-hester-touchdown-return-with-bears). Start with the Super Bowl opening return; compare the Giants missed-field-goal return as a distinct play, not a kickoff rules template. [Bears rookie-season account](https://www.chicagobears.com/news/road-to-canton-remembering-devin-hester-s-remarkable-rookie-season).

### Barry Sanders — elusive runner
Sanders describes how his stature enabled abrupt stops and acceleration. [Hall of Fame: Born to Run](https://www.profootballhof.com/news/sanders-born-to-run).
Design interpretation: low running posture, short approach steps, visible braking, outside-foot plant, hip shift, sharp cut and renewed acceleration. The defender should commit to the first direction, miss, then recover. Use a spin only when the contact geometry warrants one. Random zigzags and repeated spinning would erase the intent. Failed moves end in credible containment, a wrap or loss of ground.

### Calvin Johnson — dominant receiver
The Lions describe his combination of size, speed, leaping and acrobatic receiving. [Lions Hall of Fame profile](https://www.detroitlions.com/news/lions-legend-calvin-johnson-elected-to-hall-of-fame).
Design interpretation: powerful release, long stride into the route, turn toward the arriving ball, gather, elevate, extend hands, secure and land. Defender contests the catch point rather than waiting underneath. Include ordinary catches, contested wins and incompletions; not every reception is a spectacular leap. The ball must visibly arrive at the hands before possession changes.

### NFL Street — expressive football and active opponents
EA designer Jason Barnes describes captured wall moves, defenders sidestepping blocks, desperation tackles, lead passing and receiver move attributes. [First-person designer diary](https://www.gamespot.com/articles/nfl-street-2-designer-diary-1/1100-6112554/).
Design interpretation: exaggerate the anticipation, plant, airborne silhouette and impact response enough to read on a phone. Let blockers and defenders participate in the spectacle. Stadium retains its own two-possession format, kicks and ties. Wall runs belong only in an environment that actually has a playable wall; they are not required to capture Street's energy. Do not add a new GameBreaker resource just to imitate the reference.

## Football movement vocabulary to implement
These are proposed staging rules, not a new football rulebook.
- Quarterback: receive snap, drop/set feet, scan, step and release. Distinguish handoff, pocket pass and rollout.
- Receiver: release, stem, brake/plant, break, locate ball, catch, land and run after catch. Route names must correspond to the path shown.
- Running back: gather handoff, press the called gap, read the lead block, cut or drive through contact.
- Offensive line: set stance, first step, engage, maintain leverage; a pulling blocker travels to the point of attack. Never slide an entire line downfield together.
- Defensive line: get-off, engage, shed or stay contained, then pursue.
- Coverage: backpedal or turn with receiver; man follows an assignment, zone protects a region and reacts to the ball.
- Tackler: close under control, plant, wrap or dive, then recover. A missed tackle needs a visible cause.
- Kicker/holder: snap, catch/spot, approach, plant, swing, follow-through and readable ball arc.
- Return teams: spread lanes, identify a block, preserve outside contain and converge along different angles.

## Presentation contract
Use named actors from the stored lineup snapshot wherever the game supplies them. Nine lineup slots are not an eleven-player NFL roster: extra visual personnel must be anonymous supporting roles, with no invented player ratings. Keep home/away kits distinct and make possession obvious through the ball, not a glowing dot alone.

An animation plan consumes the confirmed event, selected call, possession/direction, start/end yard lines and outcome. It must not reroll a result. Path variation may be deterministic from saved information. If the event lacks a specific football cause, show a neutral outcome instead of inventing a credited tackle, interception, injury or stat.

Suggested sequence: 0.6–1.0 seconds to recognize formation; 0.2–0.4 for snap/gather; 2–4 for the action; 0.4–0.8 for the outcome. Tune visually. Reserve brief slow motion for one decisive beat. Keep the landing spot, score and next decision readable. Skip and reduced motion preserve all results and rewards. Pause playback while hidden and clean up animation subscriptions.

## Build order and concrete acceptance
1. Shared field-player renderer: approved practice identity, team colors, facing, feet anchored to field, depth ordering and real action poses. Audit existing art coverage before commissioning missing poses.
2. One complete return with Hester-inspired tempo, one blocker engagement, one pursuer reaction, and both a contained and breakaway outcome.
3. Sanders-inspired run: press, cut, pursuit adjustment, tackle or escape; include no-gain/loss outcome.
4. Johnson-inspired pass: snap, route, release, catch contest, landing; include completion and incompletion.
5. Expand across every existing call and the kick/conversion sequence. Preserve both possessions and server accounting.
6. Verify on 390x844, phone landscape and desktop. Run a full game, skip a sequence, reload between calls, and collect once.

A sequence is not accepted merely because sprites render or tests pass. At phone size, without the explanatory text, a viewer should identify the ball carrier, intended play, decisive interaction and final outcome. Players must accelerate and plant rather than skate; blockers cannot overlap through opponents; the ball cannot teleport; an animation cannot celebrate a score the server did not award. Compare the same situation for an ordinary player and an elite archetype: identity should differ without overriding the confirmed result.

## Next footage pass
For each selected official clip record catch/snap, first plant, defender commitment, separation, finish, camera framing and the supporting block. Timestamp only after directly observing playback. Use those observations to revise the proposed poses and timing above; do not fabricate frame counts from written profiles.


## Expanded study — offense, defense, special teams and stadium life
Added 2026-09-11. The following is an implementation design informed by the cited coaching and rules sources. Athlete-specific animations are proposed interpretations, not claims of completed motion capture or frame-by-frame film analysis.

### Defensive identities
**Brian Urlacher: range with responsibility.** The Bears account describes stopping the run first and the deep middle/seam responsibility in their Cover-2 system. For our Tampa-2-style presentation: read the release, open hips and carry the middle seam; close underneath when the ball is thrown. On a run, track laterally and fit an assigned lane. Do not send this player charging at the quarterback every snap. [Bears explanation](https://www.chicagobears.com/news/as-always-defense-will-focus-on-stopping-run-first-8467955).

**Ray Lewis: diagnose, communicate, attack.** The Ravens film-study session with Roquan Smith supplies a reference for recognition and linebacker leadership. Proposed staging: point out a threat before the snap, take a controlled read step, scrape behind the defensive line, shed a block and close for a wrap. A powerful finish is earned by positioning, not a teleport or constant dive. [Film-study context](https://www.baltimoreravens.com/news/ray-lewis-roquan-smith-watching-film-together). Viewing queue: [Dean Pees breaks down Lewis](https://www.baltimoreravens.com/video/play-like-a-raven-ray-lewis-8531434).

**Ed Reed: disguise, range and the cost of a gamble.** The Ravens describe Reed shading one way before reversing into an interception against Manning, and a different play where a wrong read/miscommunication conceded a touchdown. Proposed staging: maintain a convincing initial alignment, read the developing throw, plant and break toward a reachable catch point. Show the successful bait and the exposed space when it fails. No omniscient movement before information becomes available. [Ravens account](https://www.baltimoreravens.com/news/reed-waiting-for-no-18-7748436). Viewing queue: [Chuck Pagano film breakdown](https://www.baltimoreravens.com/video/2011-ravens-report-pagano-breaks-down-film-of-ed-7647738).

### Plays should ask football questions
For every existing call, author a formation, each player's assignment, the defender being put in conflict, quarterback read, protection requirement, success path and failure path. A name and a favorable percentage are insufficient.

| Concept | What the player is trying to create | Required visual evidence | Defensive answer / tradeoff |
|---|---|---|---|
| Slants | Early inside separation and a quick throw | Release, diagonal break, QB releases before pressure arrives | Inside leverage or an underneath defender can close the window; outside space remains |
| Flood | Short, intermediate and deep threats on one side | Three different route depths, with the QB reading the defender between them | Disciplined coverage can pass routes off; the offense must not get an automatic completion |
| Power | Extra blocking strength at a chosen point | Down blocks, a visible pull/lead assignment and runner following it | Fit the gap, defeat the lead block, keep outside contain; over-pursuit exposes a cutback |
| Verticals | Stretch deep coverage and find a seam or favorable matchup | Different receiving lanes, QB protection, ball flight, tracking and catch contest | Protect deep space and make the offense take less; pressure can prevent the route developing |

The Eagles breakdown explains flood as a three-level stretch and shows how route combinations create a coverage conflict. It also illustrates disguised pressure and why the apparent front does not uniquely identify the rush. [Eagles coaching analysis](https://www.philadelphiaeagles.com/news/eagle-eye-d-must-prepare-for-the-flood-13714165).

For future inside-zone work, keep gap responsibility and combinations distinct from a pulling power scheme. USA Football describes inside zone as building on gap responsibility and displacement. It is not interchangeable with every run up the middle. [Inside-zone coaching](https://blogs.usafootball.com/blog/1428/building-an-offensive-line-coaching-the-inside-zone).

### Defense is a set of jobs, not a single chase behavior
Proposed initial coverage library: man with help; Cover 2; Cover 3; Tampa-2-style seam carry; a pressure call with explicitly assigned coverage behind it. Separate the front, pressure and coverage in internal data even when the player sees a short label.

Man defenders follow assigned receivers with leverage and reaction time. Zone defenders relate to threats entering their region, then pass them off; they do not stand still until the ball arrives. Contain defenders protect an edge rather than following every fake inward. Interior defenders maintain or attack their assigned gaps. Safeties preserve depth until their read justifies closing. Blitzers create a vacancy that the remaining coverage must address.

Use proposed novice labels such as “Protect deep,” “Crowd the middle,” or “Pressure the passer,” followed by one plain-language tradeoff. Stronger IQ can support better reads only where the authoritative rules model that effect. Animation alone must not secretly change completion, interception or tackle odds.

### Special teams deserve separate staging
- Kickoff: kicker approaches, ball travels, returner locates and secures, blockers engage, coverage preserves lanes, returner reads a seam. A short return should still be satisfying to watch.
- Hester is a movement reference, not permission to reproduce a historical kickoff formation under a different rule set. The 2026 rulebook changes receiving-team alignment; choose and label Football HQ's simplified kickoff rules deliberately instead of silently mixing eras.
- Kick decision: show the named kicker, spot, distance, expected difficulty and what success achieves. Stage snap, hold, plant and swing; flight must reach the appropriate uprights. A miss ends outside the scoring target, not along the same successful arc with different text.
- Two-point play: compressed formation, short decisive route/run, visible defensive response. Keep the agreed rule that an irrelevant try is skipped.
- Punt, onside kick and return touchdown variants are future scope unless already supported by the game contract; no decorative depiction should award an unsupported outcome.
Official reference: [2026 rulebook](https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf). Footage queue: [NFL dynamic kickoff explanation, 2025 edition](https://www.youtube.com/watch?v=G0TdMuJZEiw); use the 2026 rules for changed details.

### Field, camera and scale
NFL reference geometry: 120 yards overall length, 100 between goal lines, 10-yard end zones, width 53⅓ yards. NFL hashes are 18 feet 6 inches apart. Keep a world coordinate system in yards and project that into the camera. Boundaries, goal lines, players' ground contact, ball spot and overlays must use the same transform. Source: the field diagram and Rule 1 in the [2026 rulebook](https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf).

Proposed camera: establish the field before kickoff, then frame the line, eligible targets and relevant defenders. Follow the ball smoothly after commitment. Show the end zone when a scoring opportunity matters. Portrait can frame a smaller region; landscape exposes more lateral spacing. Never squeeze the entire field into a small rectangle just to keep it all visible. Do not reverse home/away orientation between camera shots without a clear cue.

The ground footprint of a player remains credible in yards. Stylized heads and upper bodies may be enlarged for readability; shadows anchor feet, airborne players separate from their shadows, and depth ordering prevents a receiver being drawn through a blocker. Sideline staff occupy a separate region beyond the playing boundary. Coaches, substitutes, benches and officials have distinct areas in the NFL's [bench-area diagram](https://static.www.nfl.com/image/upload/v1783553349/league/ops-bench-area_2021_rc20vd.png).

### Crowds and sidelines: proposed atmosphere system
This section is an authored game design, not an asserted observational study of crowd footage.

Use a small event-driven state set: anticipation, developing opportunity, big stop, confirmed score, disappointment and settling. Home and visiting sections react differently. Small groups have staggered motion rather than the entire stadium bouncing in sync. Sound and movement rise around a breakaway or contested catch, then peak only at the confirmed outcome. Do not play a touchdown celebration for a missed kick or a no-gain run.

On sidelines, coaches signal, reserves watch and react, players warm up in a bounded area, and staff stay clear of the boundary. A teammate can greet the returning unit after a score. Include benches, equipment, towels, water and tunnel entrances with coherent access paths, rather than random decorative objects on the playing surface.

Stadium upgrades change seating, crowd density, lighting, tunnel presence and team branding; the field geometry stays stable. Build distant crowds from inexpensive repeated art with variation; reserve animation detail for the active players. Audio is optional and respects mute; reduced-motion mode retains understandable event reactions.

### Strategy in the agreed two-possession game
Retain exactly one possession per side and ties. Do not import NFL sudden death simply because NFL references are being studied. Show possession number, score, available decisions and the current target. On the second possession, explicitly state whether three ties, six wins, or a conversion can change the result. On defense, state the consequence of conceding a field goal versus touchdown. These messages must be calculated from the actual score and remaining sequence.

Keep uncertainty fair. A pre-snap look may be an observed alignment, not a promise about the post-snap call. If the current contract reveals an exact defense, presentation must honor it; adding disguise as gameplay requires an explicit authoritative contract change. No hidden re-rolls in the animation layer.

### Acceptance scenarios
- Identical offensive call against two defenses produces visibly different assignments, where supported by the confirmed events.
- Urlacher-style seam carry, Lewis-style gap attack and Reed-style late break are distinguishable without name labels.
- A blitz has a visible rusher and an understandable coverage cost; every defender does not rush together.
- The return lane chosen is the lane initially attacked, with a credible reason for a subsequent cut.
- The displayed catch point, tackle spot and goal-line crossing agree with the saved event.
- The same player identity, uniform treatment and proportions persist from Practice Field to Stadium.
- Crowd, sidelines and scoreboard react to the same confirmed outcome.
- Full game at portrait, landscape and desktop; no cut-off controls, unreadable actors, teleporting ball, synchronized row sliding or scene transition that skips reward accounting.

### Remaining study before calling this film-verified
Directly observe the linked coaching videos and representative stadium broadcasts. Log clip timestamps for stance/read/plant/engagement/recovery, plus crowd and sideline timing. Written-source research and linked video queues are complete here; video playback, measured animation timings and the actual renderer overhaul are not represented as completed.


## Confirmed creative direction — 2026-09-11
User selected approximately 4/10 exaggeration and watch-only execution after calling plays. No mid-play prompts, timing minigames or direct steering. The isolated dev/stadium-movement.html return study begins assignment/camera validation; it is not live and still uses static source poses. Three presentation tests and typecheck pass. Native phone render exposed the need for a closer active camera; a 40-yard camera region replaced the full-width view. Running/contact art and full game integration remain outstanding.
