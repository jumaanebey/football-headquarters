# Connected player milestone — 2026-09-10

Base: main 68c1818 (#43). Branch: codex/connected-player-milestone.

## Implemented

- Naming remains account-free. The second tutorial screen teaches one action, with contextual battle guidance and the Heroes practice route retained.
- A dismissible backup invitation appears on the campus after a completed Stadium upgrade (level 2+) or a real recorded rival raid, with no pending protected operations. Existing linked accounts are excluded. Dismissal is scoped to the club account and persists on the device. Settings remains the explicit sign-in/backup route.
- Competition always shows the current club immediately. Campaign coaches are explicitly AI challenges, separate from published-player standings. Challenges open existing match preparation; locked stages remain disabled. Loading failure has retry and is distinguished from a healthy empty board. Displayed ranks refer to the loaded board, with no fabricated player position.
- Desktop battle uses a full-height field and persistent side command roster. Large desktop campus uses a club command panel for preparation, defense, standings and the last collected result. Phone and landscape layouts retain their own breakpoints.
- Optional on-field labels show real actor identity and moving/engaging/signature state. Camera controls moved into the command tray to stop covering the small-phone sideline; repeated coach speech is hidden in narrow field containers.
- Collect & make result card opens a card from collected match history. Protected play waits for a confirmed server battle result and respects owner/duplicate guards. Pending results do not open a card. The latest collected result remains available from Standings after reload/recovery.
- Cards export PNG at 1200×630, support native sharing when available, download, clipboard and manual-link fallback. No rewards, credentials, IDs or receipts are included. Practice/replay have no collect/share action. Cards snapshot their display fields when opened. Sharing never submits another settlement.
- Home-screen UI integration is implemented behind manifest detection. It captures the install event from app startup, handles accepted/dismissed/error outcomes, detects standalone mode and provides manual browser instructions. It never reloads the app. **Actual install availability awaits Claude's manifest/service-worker package; it is not currently claimed live.**

## Rendered acceptance evidence

| Journey | Evidence |
| --- | --- |
| New local visit | Named Journey Local QA without an account; one-action playbook; Look around first; current club and labeled AI challenges in Competition. Local dev has no club service configured. No backend QA identity created for this run. |
| Local play to card | Competition → opener preparation → Air Raid → five heroes + Hail Mary → 76% / 2-ball win → Collect & make result card. Coins 500→1,103, Fans 0→11, Crowns 10→18. PNG natural size 1200×630, clipboard success, download triggered, result available after reload. |
| Meaningful return prompt | Earned income, spent 1,400 Coins on Stadium upgrade, waited 20 seconds; invitation appeared after Stadium level 2, not when starting the job. Not now persisted across reload. |
| Live protected play | Reused Campus QA FC, revision 26. Competition loaded 17 published clubs plus separate campaign coaches. Reserved/played opener using Air Raid, five heroes and Hail Mary. Collect & make result card showed confirmed 3-ball victory. Coins 888→1,345, Fans 60→75, Crowns unchanged at 18. Reloaded Settings: revision 29 / everything confirmed. No new live account. |
| Desktop battle | At 1440×900, stage 1037×825 beside 403px command rail. Hero deployment, ready signature and on-field moving/engaging states rendered. |
| Breakpoints | Actual rendered deterministic battle fixture at 320×568, 390×844, 430×932, 844×390, 1440×900, 1920×1080. At 320×568, field about 188px square inside a 205px stage; scrollable command tray inside viewport. This is viewport emulation, not physical hardware. |
| Close/reopen defect | Rendered testing exposed duplicate sibling React keys for the share panel and backup invitation, leaving a stale sheet after close. Namespaced keys fixed it; opened/closed twice through both Back to club and header Close, each leaving zero dialogs. |
| Camera obstruction | Small-phone rendering found camera overlay covering the sideline. Moved into command tray; subsequent DOM render confirms no camera controls inside field stage. |

Full release verification passed before the final camera/close cleanup: 468 tests / 58 files, typecheck, build, asset decoding, atlas checks, restore rehearsal, parity and balance. Final changes receive a fresh check and CI before merge. Tests cover failure-vs-empty standings and image export failure/privacy. Combat rules/server unchanged. Repeating the full live account-creation suite is unnecessary for this presentation change.

## Limits and external dependencies

Claude's performance/install/measurement package has not arrived as an integration PR. Initial-transfer reduction, immutable asset caching, manifest/service worker, SEO files and funnel report are Claude's scope, not completed by this client release. The new install UI remains hidden until a manifest exists; service-worker safe-update behavior still needs integrated verification. No claim of a measured startup improvement.

Native OS share completion/cancellation and physical iOS/Android install acceptance are not manually verified here. Browser share/download fallbacks are implemented; PNG and clipboard were rendered/used. New manual account switching, rejected settlement and lost-response injection were not repeated; existing authority tests and owner/duplicate guards remain intact. Additional authored art, lineup semantics, replay comparisons and human difficulty testing remain separate backlog work. No QA accounts deleted and no retention/stateVersion decision changed.

Final local check after the camera/key fixes: 468 tests / 58 files, typecheck, 547 raster decodes and production build passed. Diff whitespace check passed.
