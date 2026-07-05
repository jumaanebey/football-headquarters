# QA CHECKLIST — the scripted pass (Phase C and every phase-end after)

Run top to bottom, ~12 minutes. Desktop before each release; ON PHONE for Phase C.
Anything that fails or *feels wrong* goes in the Findings table at the bottom — feel
counts as a bug during Phase C.

Phone setup: same wifi → `http://192.168.1.198:3000` (dev) or
`https://football-headquarters.vercel.app` (prod). Two devices = two real coaches:
each device gets its own club automatically.

---

## 1 · First contact (fresh save — use a private/incognito window or second device)
- [ ] Game loads to the name-your-club screen; 🎲 reroll works; name sticks
- [ ] "Storm your first rival!" opens Game Day; you can win your first away game
- [ ] After the battle: goals panel makes sense; the arrow points somewhere useful
- [ ] Nothing overlaps or clips at your device's screen size (HUD, goals, nav)

## 2 · The home board (your main save)
- [ ] Tap each building → its sheet/card opens (Stadium, Training Field, Rehab, War Room, Scouting)
- [ ] Coin bubble on the Stadium collects with one tap
- [ ] Finished drill ✓ collects with one tap
- [ ] Defenders visibly patrol with 🛡️ badges; board feels alive
- [ ] Buildings wear the black/orange club identity (Round 4 art)

## 3 · Coach & train
- [ ] COACH → tap a position group → pick a drill → players walk to the field and train
- [ ] Readiness climbs; at 100% the FIRED UP goal appears

## 4 · Scouting
- [ ] Scouting Dept → prospect board renders; Scout starts a timer; Sign adds the player

## 5 · Heroes
- [ ] HEROES → all 9 heroes visible with real art; locked ones show unlock terms
- [ ] Train a hero level (coins deduct, stats move); Scout Search rolls (crowns deduct)

## 6 · Chalkboard (the big one — THUMBS, not mouse)
- [ ] Intro card appears once on a fresh save, never again
- [ ] Red/green raider lanes visible; dashed ➜ vs solid 🔒 reads clearly
- [ ] DRAG a building — sprite rides your finger, 2×2 ghost, drop works, undo reverts
- [ ] Tap equipment / bus → it rotates
- [ ] Paint a sled line across grass in one stroke; one undo removes the whole stroke
- [ ] Drag a chip from INVENTORY onto the board; drag a SHOP item (buys + places)
- [ ] Lanes react as you seal them (red → green + 🔒)
- [ ] 🧪 Test runs a scrimmage against the exact layout
- [ ] ↩︎ undo count is right; Done exits clean
- [ ] **Pave Parking Lot** if affordable — apron shows in the next defense

## 7 · Game Day
- [ ] Season list: coach faces, NEXT GAME badge + trash talk on your next stage
- [ ] Energy chip shows ⚡12; launching deducts it; gassed = clear error
- [ ] Play a Season stage AND a scrimmage-bot raid start to finish
- [ ] In battle: game plan picker locks at first snap; damage numbers; momentum bar;
      announcer lines; abilities fire; result sheet (Field taken / Gate haul / MVP)

## 8 · Live Rivals (needs both devices)
- [ ] Device A raids Device B's real base (fuchsia LIVE row)
- [ ] Device B (reload) sees the attack in Defense Log with ▶ Watch
- [ ] ▶ Watch replays A's actual moves, home colors, REPLAY badge, no rewards
- [ ] Revenge from that entry attacks A's REAL base; A later sees the revenge + replay
- [ ] Standings → Live Rankings shows both clubs, correct order, You badge

## 9 · Defense
- [ ] Defense Scrimmage: your defenders take the field (announcer counts them),
      crowd ERUPTS (fans ≥ 300), Crowd Noise + Goal-Line Pkg buttons work
- [ ] Turrets look like what they shoot (flags from Ref Tower, shirts from Cannon)

## 10 · Safety rails
- [ ] Settings gear: mute toggles; Export downloads a file; Import of that file
      round-trips (confirm dialog → reload → same club)
- [ ] Reset is behind Settings and double-confirms
- [ ] Esc closes any open sheet (desktop)
- [ ] Reload mid-anything: nothing lost beyond the last ~2s

## 11 · Feel (subjective — answer honestly)
- [ ] Could a stranger learn this game from its own screens?
- [ ] Does every screen feel like the SAME game (colors, buttons, text sizes)?
- [ ] What's the single worst-feeling interaction right now?

---

## Findings — <date> — <device>

| # | Where | What happened / what felt wrong | Severity (blocker/bad/nit) |
|---|-------|--------------------------------|----------------------------|
| 1 |       |                                |                            |

## Known issues going INTO Phase C
- README screenshot regeneration pending (contended machine — retry or capture during this session)
- Round 4 art: 10 building recolors + 2 currency icons + 5 decor recolors pending quota
- User's board currently bare (everything in inventory after Store All) — REBUILD THE
  DEFENSE as part of step 6 and it doubles as the Chalkboard test
