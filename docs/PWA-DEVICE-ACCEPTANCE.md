# Football HQ — physical-device acceptance script (install, offline, update)

Status: **written, not executed**. Every check in `docs/PWA-RELIABILITY.md` and `docs/PERF-INSTALL-MILESTONE.md` is **emulator/headless evidence** (HeadlessChrome 152 on macOS with 430×932 mobile emulation; vitest with fake globals). Nothing below has been run on a phone. Run it against a Vercel **preview** deployment of the branch, never against production with a real club.

Conventions: one row per step; *Expected* is what a pass looks like; record the actual result in the last column with the device model, OS version and browser version. Use a throwaway club name so the QA rows can be excluded from the weekly report by club name (they cannot be excluded by id unless the account is added to `scripts/qa-accounts.json`).

## A. iOS Safari (iPhone, iOS 17 or newer)

| # | Step | Expected | Actual |
| --- | --- | --- | --- |
| A1 | Open the preview URL in Safari. Finish naming; choose "Look around first". | Campus renders; no install prompt of any kind appears by itself. | |
| A2 | Settings → the install row. | Shows the manual text *"On iPhone or iPad: open this page in Safari, tap Share, then 'Add to Home Screen'."* — no button that claims to prompt. (`installSupport()` → `platform: 'ios', canPrompt: false, manualInstructions`) | |
| A3 | Share → Add to Home Screen → Add. | Icon uses the app icon (not a screenshot); name "Football HQ". | |
| A4 | Launch from the Home Screen. | Opens standalone (no Safari chrome), splash on `#0f172a`, lands on `/?src=pwa`. Settings install row now shows nothing / "installed" (`installed: true`, no instructions). | |
| A5 | Force-quit the app. Enable Airplane Mode. Relaunch from the Home Screen. | The shell loads from cache within a few seconds; campus renders (hero campus sheets from the art cache); the connection row says *"Offline: local play continues; online rewards, upgrades and rival games wait for the connection."* Nothing claims that anything settled. | |
| A6 | Still offline: open Heroes, open a hero, start a practice game. | Heroes modal opens with portraits; a battle sheet that was never loaded shows the **portrait fallback**, the game still runs; no blank hero, no error screen. | |
| A7 | Disable Airplane Mode while the practice game is on screen. | Within ~3 s missing art fills in (retry on `online`); the connection row returns to *"Online: club server …"*. | |
| A8 | Deploy a newer preview build (any change), then bring the app to the foreground (or reopen it). | No reload happens by itself. If Settings shows an "Update ready" row, it only appears when the app is idle (not in a battle). | |
| A9 | Start a battle, then tap "Update now" (Settings) during it. | Refused: the row reads *"Update will apply after the game on screen ends."*; the battle continues; no reload. (`updateState().deferred === true`) | |
| A10 | Finish the battle and wait for the result to be confirmed. | The deferred update applies (one reload) **after** the receipt; the confirmed reward is visible after the reload; club state intact. | |
| A11 | Settings → Export backup. | A `.json` file is offered through the share sheet; the report will count `backup_completed { method: 'export' }` — not a cloud backup. | |
| A12 | Delete the Home Screen icon; reopen in Safari. | Club state is still there (localStorage is per origin, not per icon) unless Safari's storage was cleared. Note iOS may evict site data after 7 days without use — record whether the club survived. | |

Known iOS limits to record rather than fail: no `beforeinstallprompt` (manual install only); background update checks happen only when the app is opened; storage eviction after prolonged non-use.

## B. Android Chrome (Android 12 or newer, Chrome 120 or newer)

| # | Step | Expected | Actual |
| --- | --- | --- | --- |
| B1 | Open the preview URL in Chrome. Finish naming. | Campus renders; Chrome's own mini-infobar may appear but the app shows **no** install UI on first visit. | |
| B2 | Play one game and get a confirmed reward, then open Settings. | The install row now offers a button ("Install") because the browser event was captured (`canPrompt: true`). | |
| B3 | Tap Install → Cancel in the Chrome dialog. | Outcome `dismissed`; the row hides the button (the event is consumed); no second prompt is attempted. | |
| B4 | Reload the page, get the row back (Chrome re-fires the event after a while; if not, note it), tap Install → Install. | Outcome `accepted`; app icon appears on the launcher; the row shows installed state. | |
| B5 | Launch from the launcher. | Standalone window, splash from the maskable icon on `#0f172a`, `/?src=pwa`. | |
| B6 | Enable Airplane Mode; relaunch from the launcher. | Shell and campus from cache; offline summary shown; no settlement claim. | |
| B7 | Offline: open Heroes and start a practice game. | Portrait fallback for never-loaded battle sheets; game runs. | |
| B8 | Disable Airplane Mode during the game. | Art fills in; summary returns to online. | |
| B9 | Deploy a newer preview; background the app and bring it back. | No automatic reload; "Update ready" only when idle. | |
| B10 | Tap "Update now" during a battle. | Refused with the "after the game ends" wording; battle continues. | |
| B11 | Finish and confirm the result. | Deferred update applies once, after the receipt; reward and club intact. | |
| B12 | With the app open in Chrome **and** in the installed window at the same time, apply the update from one. | The other window is **not** reloaded; it keeps working (its cached art still loads); after it is reloaded by hand, both run the new version and only the new caches remain (`chrome://serviceworker-internals` shows one active worker). | |
| B13 | Chrome → Site settings → Clear data for the site. | The worker and caches are gone; the next visit re-registers (Settings row shows not installed / prompt again later); club data is gone too — this is the browser's reset, not ours. | |
| B14 | Settings → Export backup. | A file download; counted as `backup_completed { method: 'export' }`. Signing in and linking an account is the only `method: 'account'`. | |

## C. Kill switch (both platforms, preview only)

| # | Step | Expected | Actual |
| --- | --- | --- | --- |
| C1 | With the app installed and a club created, deploy the preview with `FHQ_SW_KILLSWITCH=1 npm run build`. Open the app. | Within the update check (on open) the page reloads once by itself and then runs from the network: `chrome://serviceworker-internals` (Android) shows no registration for the origin; club state and club name are intact. | |
| C2 | Redeploy the normal build. Open the app twice. | Second open is controlled by the normal worker again; offline relaunch works again after that. | |

## D. What to hand back

Fill the *Actual* columns, note device/OS/browser versions, attach screenshots for A4, A5, B5, B6 and B12, and record any step that could not be performed. Mark the package **verified on device** only when A1–A11 and B1–B12 pass; C1–C2 are optional but recommended before the first production deploy that ships a worker.
