# Raid mechanics overhaul — 2026-09-11

The player deploys groups and issues tactical orders. Stadium football, scheduled development and scouting stay on their existing systems.

## Delivered behavior

- Deploy one, three, or the remaining position group with a sideline tap. Members enter in a spread formation, with every individual deployment recorded and validated.
- Give the whole team or one position group a rally, focus, protect-hero, or automatic-route order. Orders apply to later group deployments. An unreachable rally is refused with a route explanation; rally resumes attacking on arrival; focus resumes automatic targeting after its target falls; protect stays near the chosen live hero. Hero signatures respect a called target.
- The command switch stays visible, target numbers match the battlefield, confirmed orders draw markers and routes, and keyboard aiming issues the same commands.
- Both attackers and defenders route around live building footprints. Solid cover interrupts passing and direct equipment pressure. An enclosed target can be reached by breaching an obstruction. Existing overlapping layouts remain hittable at the outer face.
- Linemen engage and occupy defenders instead of simultaneously damaging a building. Defenders pressure exposed passers and skill players more strongly. Nearby, unoccupied QBs with a clear lane support receiver catches; a QB elsewhere on the field grants no bonus.
- Normal passes resolve after flight. Melee contacts have a visible cadence. Released passes survive a passer tackle; a receiver tackled before a supported catch cannot claim it.
- Machines keep separate football functions. New warnings: JUGS .15s, sled .45s, ref .85s, cannon .75s, water .65s. Warnings allow rally counterplay; area attacks remain locked to the marked turf. Longer cycles preserve sustained pressure with a 5% equipment rebalance. New tackle pressure is 1.25x, with additional exposed-passer/skill matchups; an engaged blocker absorbs pressure at .65x.
- Debrief shows actual supported catches and player-seconds spent blocking, alongside existing yardage, protection, control effects and rewards.

## Compatibility and evidence

Rules `raid-tactics-5` are negotiated explicitly. `hero-actions-3` and `defense-counters-4` remain supported. Missing rules still select the legacy server contract. New orders are rejected by old-rule films. An eight-film v4 corpus was captured before changes; existing v3 fixtures remain unchanged.

Local checks: 686 tests across 89 files; typecheck; all 219 balance scenarios and existing acceptance gates. Fresh Week 4: 49%; trained Week 4: 100%; highest progression Championship: 100%. Balance bots do not use tactical orders. Four of five sampled road tiers saturate on wins: these checks establish integrity and progression, not final competitive difficulty.

Native phone journey at 390×844: one tap sent three linemen; added QB; protected hero; called Stadium; used Hail Mary; deployed three playmakers and Enforcer; keyboard rally; reached debrief with 8 supported catches and 22.6 player-seconds holding defenders, no console errors. The isolated fixture creates no account and does not change saves. The same fixture is `/dev/raid-journey.html?tactics` in development only.

Authority v7 is ACTIVE with JWT verification. Inline artifact pinned at d28b2a70b8aa5cd44984a389974597f6cbadf442, sha256 dfe1b18ad512f83897d1ce5d0bd4019a7c66e64c8df50c0dc1255e5c25e9e77a. Management readback exactly matches all 174117 characters. Strict source/bundle/staged/deployed parity passes.

Live evidence: **69 passed, 0 failed**. The new server accepted all three negotiated rule versions, tactical focus/protect/rally commands, completed games and exactly-once rewards; rejected forged films and unauthorized film access; completed a server-timed Stadium upgrade; preserved the assigned gate hero and defense formation; shared identical replay film between both accounts and applied the defense shield. See `docs/evidence/raid-tactics-live-2026-09-11.txt`. Three evidence account IDs are excluded in scripts/qa-accounts.json and retained for deferred cleanup.

Strict release verification passed in 38 seconds. Browser automation under headless Chrome is unavailable on this machine; native browser rendering was used. Core coaching controls also verified at 844×390 landscape and 1440×900 desktop, with no page-width overflow. The final mode switch resets the command panel to its top; landscape removes redundant instruction text so group, orders, targets and hero controls fit together.

## Release / rollback

Deploy authority v7 before shipping the client. Retain v7 if rolling the frontend back, so pending new-rule raids and v6 facility activity state can still settle. No migration, credential or account policy change.
