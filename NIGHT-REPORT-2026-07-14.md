# Overnight report — Football HQ, 2026-07-14

> ## ⚠️ CORRECTION (added after review)
>
> **The premise this report was built on was wrong.** I claimed "~19 real people played,
> 18 never earned a trophy." That was inference, not fact, and Jumaane was right to
> challenge it.
>
> `fhq_bases` rows are **not people.** `publishBase` fires on mount for every fresh device
> identity, so clearing localStorage during development publishes a new base each time.
> The data shows three bases within 60 seconds (Jul 08 16:57, 16:57, 16:58) and 18 of 20
> clubs carrying the game's **auto-generated default names** (`genTeamName()` — surname +
> suffix). That is a dev loop, not an audience. The game has never been marketed.
>
> **There are no analytics.** `fhq_events` has 0 rows and always has: the sendBeacon bug
> dropped 100% of events until it was fixed, and everything after the fix was test data
> that has been deleted.
>
> **What survives:** every bug below was verified against the code or measured on the wire,
> independent of the player-count claim. **What does not:** the "retention cliff" framing,
> and any prioritization justified by it. `trophies: 0` means "someone clicked through a
> tutorial", not "a player churned."

**Everything below is live on production and verified on an emulated iPhone 14.**
Rollback: `git reset --hard pre-night-2026-07-14 && git push --force origin main` (tag = `d810caa`).

---

## The headline

The fixes below are real and verified. The *motivation* I originally gave for them was
not — see the correction above. These were found by reading the code and measuring the
page, so they stand on their own:

**The worst one:** the first instruction the game gives every new coach — *"Fortify your
base — install defenses"* — is **impossible to complete.** It fires whenever you have
fewer than 2 defense slots, but the 2nd slot needs Stadium L2, which a new player doesn't
have. It was priority 4, which made it goal **#1**.

## Shipped (all verified live, not just compiled)

### First session
- **Impossible first goal** — gated behind Stadium L2. *(the one above)*
- **Nothing pointed at the next game.** Added a top-priority "Play your next game —
  Week N" goal that launches it directly.
- **"Storm your first rival!" opened a manual, not a rival** — four tabs, a Gauntlet
  card, and five currencies before a single down. Now drops straight into the game.
- **The tutorial lied.** It taught three *base-screen* cues (Goals panel, bouncing
  arrow, glow) and then dropped the player into the *battle screen* where none exist.
  "You'll never be lost" was falsified in ten seconds. It now teaches the battle screen.
- **The first battle showed the wrong club name** — a stale closure meant you watched
  your first game under the random auto-generated name, two seconds after typing yours.
- **Energy didn't regen while away.** Coins did. Quit below the 12⚡ a game costs and
  you came back the next day *still unable to play* — the exact cohort we need back.
- **Backing out of deploy silently ate 12⚡** — no game, no refund, and no analytics
  event, so the drop-off was invisible in the funnel too.

### Silent data loss (both confirmed, both nasty)
- **A network blip during sign-in could destroy a real club.** `fetchCloudSave`
  returned `null` for *both* "no save" and "request failed", and the caller answered
  `null` by **pushing the local save up**. Sign in on a new device while the lookup
  times out → your 3-week-old club is overwritten by the fresh one — and the UI says
  *"Club saved to the cloud ✓"*. Now tri-state; never pushes on error.
- **The 2s autosave could push a stale club over a newer cloud one** before the boot
  sync had decided which was newer, then win the recency check on the way back down.

### Correctness
- **Rivals were raiding the wrong base.** `publishMyBase` read a stale render closure,
  so every `setTimeout(publishMyBase, 500)` published the base *as it was before* your
  change: without the turret you just bought, with the formation you just switched off,
  and with trophies one raid stale (which also skewed matchmaking).
- **Revenge double-charged 12⚡** — a 4s in-flight guard protecting a 10s fetch, so the
  natural second tap on mobile data launched a second raid.

### Language (a newcomer met 5 currencies and a jargon wall before playing)
- Unit names now say what they are: **Linemen / Playmakers / Pass Rushers / Defensive
  Backs** — no position abbreviations mid-battle with a clock running.
- **The result screen never told you if you won.** "Shut Out" / "Goal-Line Stand!" are
  flavour. The verdict now leads: **YOU WON / YOU LOST**.
- **"💥 Takeaways" was factually wrong** — it counts defenders you flattened; a takeaway
  is a turnover. "Players stuffed" read like you stuffed them; it's your own losses.
- **A developer message was shipping to players:** *"Live Rivals not connected — raid
  real players by wiring Supabase (see PVP-SETUP.md)."*

### Performance — first load cut by 62%
| | before | after |
|---|---|---|
| Page weight (phone, cold) | **3,320,473 B** | **1,253,646 B** |
| Images | 3,113,364 B | 1,195,344 B |
| Requests | 74 | 53 |

Every sprite was a **1024×1024 PNG rendered at 11–40 px** — ~960× more pixels than the
screen can show. One rank icon rendered at **0×0** and still cost 40 KB. Converted 253
files to WebP capped at 512px (compression, not art direction — nothing was redrawn;
displayed sizes top out ~120 CSS px, so at DPR 3 there's real margin). Also: all 18
rival-coach portraits (731 KB) were eagerly downloaded onto the *home screen* for a screen a player only reaches after the tutorial — now warmed when Game Day opens.

---

## New tools
- **`node scripts/mobile-check.mjs`** — drives an emulated iPhone through a cold-start
  first session; reports console errors, overflow, sub-44px touch targets, and whether
  a player can actually reach a game. Chrome's minimum window width made this
  untestable by hand, which is why mobile went unverified for so long.
- **`npm run funnel`** — now also reports **CHANNELS**: tag a link `?src=reddit` and it
  shows *players* per source, through to "played a game" and "came back".

---

## Needs your call (I did NOT ship these)

1. **Campaign wins award ZERO trophies** (`App.tsx` — `trophyDelta = isCampaign ? 0 : …`).
   Trophies come only from raids. So the onboarding I built routes every new player into
   the one mode that structurally *cannot* move the number in their HUD. Options: award
   trophies on campaign first-clear (I didn't — trophies drive PvP matchmaking, and
   inflating them would throw new players against tougher rivals), or point players at
   their first **raid** right after the first campaign win. **This is the biggest open
   design question and it's yours.**
2. **There is no reason to return tomorrow.** No streak, no timer, no appointment
   mechanic (upgrades cap at ~5 min), and the stadium's offline bank fills in 3.3
   minutes — a full day away pays the same as a bathroom break.
3. **Safari deletes localStorage after 7 days of no visits.** Any player who doesn't
   return within a week loses their club entirely. `linkAccount` exists but is buried in
   Settings. This will silently eat the exact cohort you're chasing.
4. **Crown-slot buttons charge the wrong price and unlock the wrong slot** — tap the
   "120👑" row, get charged 40👑 and receive a different slot. Not destructive
   (it undercharges), but the UI is lying.
5. **Battle frame rate**: ~55 entities animate `left`/`top` (layout properties) at 20 Hz
   with zero memoization — the whole 1,100-node battlefield relayouts every 50 ms.
   `transform: translate3d` + memo is the fix. Real work, not a one-liner.

---

## What I could not do
- **Judge whether it's fun.** Pacing, difficulty, whether the 60-second clock feels
  tense or stressful — that's yours.
- I kept my own guardrails since you skipped the off-limits question: **no deleted
  features, no art redrawn, no PvP schema changes, no gem pricing changes.**
