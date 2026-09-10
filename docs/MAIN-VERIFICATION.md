# Independent verification of current main — 2026-09-10

Branch `claude/fhq-verify-main` from main `44f3519` (PRs #52, #53, #54 merged; PR #45 merged as part of the run-up). It adds **verification tooling only** — no product, rule, worker or art change — and records what that tooling found about the implementations already on main.

Context: while this milestone's packages were being built, Codex integrated Package A (asset reliability) and Package C (growth/equipment models) into main, and shipped its **own** implementations of hero-motion identity (`b4a87c6`) and safe updates/offline chunks (`74bbf73`). This document verifies those shipped implementations rather than proposing a second version of them.

## What the tooling is

| Script | What it does | Equivalent on main before this branch |
| --- | --- | --- |
| `art/hero-motion-compare.{html,tsx}` + `scripts/motion-clips.mjs` | dev-only fixture running all nine heroes down one scripted path (idle → start → left → turn → right → stop → attack → hit → signature → idle) with pause/step/speed, and a capture script that renders before/after strips at phone and inspection scale, samples every 50 ms, and reports pairwise identity | none |
| `scripts/journey-check.mjs` | compact journey (name → campus → Roster → Scouting → Heroes → Game Day → preparation → reserve → deploy → signature → result → campus) repeated N times, measuring requests, transfer, decoded hero-art frames and entries, retained entries, art subscribers, canvases, DOM and heap | none |
| `scripts/pwa-killswitch-check.mjs` | kill-switch rehearsal from a controlled old-worker fixture on a built preview | none |
| `scripts/pwa-multitab-check.mjs` | two tabs on different versions after a simulated deploy | none |
| `scripts/with-preview.mjs` (guard added) | refuses a port that is already answering, so a parallel dev server cannot silently receive a check | port was not checked |

The fixture is served only by the dev server, exposes a read-only snapshot plus clock controls, and is never part of the production build. `?profiles=off` flattens every hero onto the Franchise's values in the dev page only, to stand in for "one shared table".

## Findings

**Hero motion identity (`b4a87c6`) — verified good.** All nine heroes produce distinct frame/pose sequences on the identical scripted path, and each differs strongly from the flattened baseline:

| Hero | Keyframes differing (of 20) | Dense samples differing (of 192) |
| --- | --- | --- |
| The Franchise | 0 | 0 |
| The Enforcer | 2 | 47 |
| The General | 4 | 44 |
| The Specialist | 2 | 43 |
| The Burner | 5 | 49 |
| The Medic | 1 | 41 |
| The Captain | 4 | 53 |
| The Playmaker | 4 | 48 |
| The Legend | 3 | 49 |

No two "after" sequences are identical. The Franchise shows zero difference **by construction**: the flattened baseline uses its own values, so it is the control, not a failure. Strips per hero: `docs/evidence/motion/*.webp`.

**Kill switch — verified good.** 13/13 on a built preview: every `fhq-*` cache deleted, worker unregistered, the open page re-navigated (1 navigation, no loop), club data and a foreign cache untouched, club-server/auth never cached by either worker, and the normal worker re-registers and controls afterwards.

**Journey and lifecycle — verified good.** Three complete rounds on a built preview (430×932 at 2×, service worker blocked so bytes are real, club server blocked at the network layer so no account or event is created):

| Round | Requests | Transfer | Hero sheets | Decoded frames / entries | Retained | Subscribers | Canvases | DOM | Heap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (cold) | 126 | 23.11 MB | 14 | 95 / 5 | 5 | 0 | 14 | 385 | 8 MB |
| 2 (warm) | 105 | 0.03 MB | 14 | 95 / 5 | 5 | 0 | 14 | 386 | 9 MB |
| 3 (warm) | 105 | 0.03 MB | 14 | 95 / 5 | 5 | 0 | 14 | 387 | 9 MB |

All ten journey assertions pass, including four different heroes drawn on the field and a signature used. Nothing accumulates across rounds; background/foreground recovery is clean; no console errors. Round 1's 23 MB is the honest cost of a complete journey that draws four heroes' authored battle art.

**Two-version tabs — not concluded.** The check's fixture assumptions (which assets tab A warms, and the campus-editor chunk name) were written against a different caching implementation and do not hold on main, so it stops at the fixture stage. This is a tooling limitation, **not** a demonstrated defect in main's `staleCaches(..., 2)` approach. Adapting it needs main's chunk names and art-cache behaviour.

## Not verified here

Live settlement against the deployed authority, physical-device install acceptance, and a real-data funnel run (no service-role key in this environment). No deployment was made and no server or authority artifact was touched.
