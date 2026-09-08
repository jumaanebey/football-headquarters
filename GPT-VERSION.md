# Football Headquarters — GPT version

A separate implementation branch of the existing game. This version preserves the
campus arrangement, facility progression, roster, heroes, campaign, away games,
Gauntlet, defense schemes, and Supabase integration.

## What changed

- Rebuilt the club HUD with named resources, a rank progress strip, and a direct
  entry to the club overview. Mobile uses a separate resource row.
- Replaced the floating unlabeled football action with a keyboard-accessible Game
  Day button in a consistent five-item navigation dock.
- Redesigned the club overview around the current stadium's real progression art,
  club power, campus growth, competition, and team readiness. Existing roster,
  Game Day, and defense actions are reachable directly from this view.
- Increased checklist text sizes, kept the mobile collapse preference, and made
  preference storage resilient to unavailable browser storage.
- Added dialog names, keyboard focus containment, focus restoration, and labeled
  close controls to the shared sheet component.
- Deferred the battle renderer until entering a game; moved the large inline
  animation stylesheet into a bundled, cacheable file.
- Added React 19 declarations and Vite environment types. Fixed the existing
  inferred rival-building array type and React JSX namespace references without
  changing simulation rules. Added a repeatable typecheck/test/build command.
- Stopped portable save files from carrying authentication and refresh tokens.
  Legacy backups can still restore progress but cannot replace the current login
  or player identity. Reconnect an online club by signing in on the new device.
- Added checks for production image references and every building/unit/defense/rank
  resolver, plus backup credential exclusion tests.

- Added an original Game Day tunnel illustration, generated with the built-in
  image tool. It loads in the Game Day selector, not on campus startup. Existing
  gameplay sprites are retained. See `art/gpt-game-day.md` for the art brief.

## Validation

Run `npm ci` and `npm run check`. This runs TypeScript, the gameplay/geometry and
regression tests, and the Vite production build. Existing engine tests pass.
Browser interaction, visual layout, and live Supabase authentication have not been
verified in this environment. The change does not require a database migration.

## Review focus

On a phone, open the club overview from the name at the top, open each navigation
item, and launch a campaign game. Check roster training, facility upgrades,
recruiting, and a returning save. Use Tab/Shift-Tab inside a sheet and Escape to
close it. The campus layout and game balance should match the original version.

The large state/controller module in App.tsx remains a follow-up architectural
opportunity. This change intentionally isolates presentation and loading changes
instead of replacing a working simulation or migrating save schemas wholesale.
