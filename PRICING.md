# Football HQ — Pricing Strategy (draft for review, July 2026)

Grounded in the live economy, not invented: gems (👑 crowns) start at 10, are
earned from raid stars, campaign first-clears, and daily quests (F2P pace per
the balance sim: ~2–3 Scout rolls/day ≈ **40–60 gems/day**). Sinks already in
the game: Scout Search **20**, timer skip **1 per 25s**, builders **40/100/250**,
crown slots **40/80/120**, recruit rush, The Legend's gem unlock.

## 1. The anchor: what a gem costs

**$1 ≈ 100 gems** at the base tier. Sanity checks against the real sinks:

| Thing | Gems | $ at anchor | Feel check |
|---|---|---|---|
| One Scout Search roll | 20 | ~$0.20 | generous vs genre ($0.30–1.00/pull) |
| Builder #3 | 100 | ~$1.00 | classic convenience price |
| Skip a 10-min timer | 24 | ~$0.24 | impulse-sized |
| A full F2P day of gems | 40–60 | ~$0.50 | $1 ≈ 2 days of play — healthy |

## 2. Gem packs (web prices; iOS uses the same USD tiers)

| Pack | Price | Gems | Bonus |
|---|---|---|---|
| Pocket Crowns | $1.99 | 200 | — |
| Sack of Crowns | $4.99 | 560 | +12% |
| Crate of Crowns | $9.99 | 1,200 | +20% |
| Locker of Crowns | $19.99 | 2,600 | +30% |
| Vault of Crowns | $49.99 | 7,000 | +40% |
| Owner's Vault | $99.99 | 15,000 | +50% |

- **Web shop (Stripe): keep ~97%.** iOS IAP: Apple takes 15% (Small Business
  Program, <$1M/yr) — web-first selling is worth real margin.
- Optional later: +10% web-only bonus gems (Supercell store pattern). Don't
  advertise the web shop inside the iOS app until we review current App Store
  steering rules.

## 3. Starter Pack — $4.99, one-time, the conversion workhorse

Contents: **500 gems + Builder #2 pre-hired + 25,000 coins + 5 Scout rolls.**
Honest value math: 500 gems ($5.00) + builder (40 gems ≈ $0.40) + 5 rolls
(100 gems ≈ $1.00) + coins ≈ **~$7 of value for $4.99** — market as "40%+
bonus," never an inflated multiplier. Surface it ONCE after a real investment
moment (first raid win or Stadium L3), never on boot.

## 4. Season Ticket — $4.99 per season (4–6 weeks)

The recurring layer, football-native naming:
- Daily claim: 15 gems/day (~600/season ≈ $6 value by itself)
- Exclusive cosmetic per season (rank skin, bus livery, stadium banner)
- Quality-of-life: 2× collect cap on the Stadium for the season
- Web = Stripe subscription; iOS = auto-renewing IAP (later)

## 5. Cosmetics & decor (with the place-your-own-decor feature)

- Decor shop: basics for **coins** (trees, banners), premium sets for **gems**
  (team-colored props, lighting packs, exclusive statues)
- Team liveries: bus + stadium skin bundles, 150–300 gems
- Rank skins stay EARNED (ladder prestige is not for sale)

## 6. Rewarded ads (non-payers)

One rewarded-video slot each: 2× a collect, +1 Scout roll/day, 1 free timer
skip/day. Caps keep it a top-up, not a grind replacement. AdMob via Capacitor.
Audience note: Kickoff Club funnel may include minors — non-personalized ads
only, and revisit entirely if the audience skews young.

## 7. Fairness guardrails (Amelia/honesty lens)

- Money buys TIME and COSMETICS, never exclusive power — every hero remains
  earnable through gems that F2P players accrue
- No fake urgency (no fake countdown "deals"), no inflated "was $X" anchors
- Real value math in every bundle claim
- Publish drop weights for Scout Search (already deterministic in gacha.ts)

## 8. Benchmarks, honestly labeled (NOT projections)

Small-title builder-genre industry ranges: payer conversion 1.5–5%,
ARPDAU $0.05–0.25. Illustration only: at 1,000 DAU those ranges imply
$50–250/day gross. Our numbers will be whatever retention says they are —
which is why monetization ships AFTER the free soft launch, not with it.

## 9. Sequencing (matches TODO launch track)

1. Soft launch free → D1/D7 retention first
2. Web gem shop (Stripe) — needs parent-co entity + real privacy/terms
3. Starter Pack + packs ladder
4. Season Ticket
5. iOS IAP parity when the Capacitor app ships
6. Decor shop rides the place-your-own-decor feature

## Open decisions for Jumaane

- [ ] Approve/adjust the $1 = 100 gems anchor and pack ladder
- [ ] Starter Pack contents + trigger moment
- [ ] Season length (4 vs 6 weeks) and Season Ticket price
- [ ] Rewarded ads: in or out for v1 (audience-age question)
- [ ] Apple Small Business Program enrollment (15% vs 30%)
