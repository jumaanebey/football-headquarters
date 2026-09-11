# Stadium player performance

Direction confirmed by Jumaane: approximately 4/10 exaggeration, automatic execution after the play call, no mid-play decision prompts or direct steering. Exactly two possessions and ties remain unchanged.

## Implemented
- Generated 32 action poses using the existing Practice Field skill-player image as the style/identity reference: carrying and empty-handed running, gather/cut/contact, receiving, blocking, defensive reactions, throwing and kicking.
- Chroma-keyed, component-isolated atlas with fixed source scale and consistent foot baseline. One 175 KB WebP; source sheets and reproducible encoder retained. Unit silhouettes use the existing illustrated style; this is a shared role-pose library, not distinct face art for every named roster player.
- Recorded-event choreography: return lane, independent blockers/pursuit, run and pass staging, kick trajectory, opposing direction and coverage assignments. Legacy events without geometry hold a still scene. No new game simulation or result rolls.
- Close camera in field-yard coordinates, team-colored uniforms, field markings, stands and sideline details. Named offensive starters from the kickoff lineup where available; support actors do not invent roster slots or ratings.
- One animation clock, background pause, reduced motion, cleanup, replay and optional skip. Calls and collection are disabled during execution. Result copy and score change appear after playback. None of these controls send a second match result.

## Verification
753 tests across 98 files passed; typecheck and production build passed. New tests cover 22 actors, persisted direction/endpoints, different defensive assignments, kick success/miss paths, kickoff touchdowns, legacy still frames, deterministic returns and all 32 transparent cell boundaries. Full offline release verification recorded separately. Native acceptance uses dev/stadium-performance.html with the actual club reducer; no live account is touched.

## Boundaries
The current match contract records the selected play and final result, not frame-by-frame physical contacts or opponent personnel. The intermediate choreography illustrates that record; it is not footage of a physics simulation. Coverage variation uses an explicitly recorded defensive call where available and generic supporting assignments otherwise. Do not claim individually modeled Hester/Sanders/Johnson/Urlacher/Lewis/Reed AI, full physical tackling, alternate camera shots, audio, personalized faces, or stadium-wide interactive crowd behavior. Those remain follow-on depth; this change delivers visible football poses and automatic staging with the existing rules.

## Art provenance
Original reference: public/assets/units/skill-positions-player.png.
Generated using built-in imagegen, 2026-09-11. Original request returned painted checkerboard; that rejected background was replaced with a solid magenta key through imagegen. Only the corrected source is in the project. Encoder isolates connected silhouettes before resampling so neighboring hands/feet cannot leak into another cell. Home orange material is recolored for away jerseys while leaving neutral whites and warm skin/leather intact. Original production player art is retained as a load-failure fallback.

Native phone run completed 3–0 with a 40-yard field goal, then collected 100 Coins. No console errors or warnings. Kick formation was tightened afterward so the four supporting protectors hold their assignments and the holder is seven yards behind the line; regression test added.
