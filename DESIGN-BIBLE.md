# Football Headquarters — Design Bible

**The single source of truth for artists and engineers.**
Everything combat-related is football, not war. Nobody gets hurt. Nobody dies. You go on the road, storm a rival's stadium, run your plays, and plant your flag at midfield until their crowd goes silent. It's a **rivalry**, not a battle.

If a choice ever conflicts with this doc, this doc wins. When in doubt: *"Would this be at home on a Saturday-morning youth-football field?"* If no, redesign it.

---

## 1) Core Fantasy

You are a **head coach / GM building a football program.** At home you grow your facility — stadium, practice fields, film room, weight room, scouting department. Then you load the bus and go **on the road** to take down rival programs.

The core fantasy of the fun moment (the raid) is:

> **"We rolled into their house, ran our plays, broke their defense down, and left their crowd dead silent."**

It is loud, hype, cartoonish, and bloodless. Think Clash of Clans energy channeled through a **college-football hype video** — smoke, confetti, mascots, a marching band, a rowdy student section — not a war room.

**Emotional beats we're selling:**
- **Hype** — mascots strutting, fans pouring onto the field, the crowd wave.
- **Momentum** — a stalled drive vs. a play that breaks open; the "+YDS" numbers popping.
- **Rivalry payoff** — the away crowd goes from deafening to silent. That's the win.

---

## 2) The Away-Game Frame

Every raid is framed as **an away game.** This frame drives all naming, art, and UX.

| Piece | Framing |
|---|---|
| Enemy HQ (their Stadium) | **Their house.** The building you must take to win outright. |
| The map you attack on | **Their field** — a rival stadium with their colors, their crowd. |
| Your deploy zone | **The visitors' tunnel / sideline** — you send your squad in from the perimeter. |
| Your units | **Your traveling squad** + **your mascot** + **your traveling fans** (the away supporters section). |
| Their defenses | Stadium "home-field advantage" gear — JUGS machines, refs, the crowd, their mascot. |
| Winning | **You silenced their crowd / took their house.** |
| Their crowd noise | A living defense (the 12th Man) *and* the scoreboard of how you're doing — it dies down as you take the place over. |

**Art north star for a raid scene:** a packed rival stadium at kickoff, your squad in road whites/darks streaming out of the tunnel, their band and student section roaring — then progressively emptying stands and falling confetti as you take it over.

---

## 3) Vocabulary Map

Rename everywhere — code identifiers, UI strings, art file names, tooltips. **Old war language is banned.**

| ❌ Old (war) | ✅ New (football) | Notes |
|---|---|---|
| HP / health | **Down Meter** (readiness) | A building's composure. Drains as you work it. |
| "Damage" | **Yards** / breaking it down | Your plays gain yards against a building. |
| Building destroyed | Building **SACKED** | Never "destroyed." A sacked building goes quiet/shuts down. |
| "Destroyed %" | **House Taken %** (label the bar "SACKED") | Keep the percent; relabel it. |
| Stars (1–3) | **Game Balls** 🏈 (1–3) | *Committed choice.* Real football MVP award; scales cleanly to a 3-tier rating. Never "stars." |
| Deploy troops | **Send in your squad** | |
| Attack a building | **Block / tackle / truck it** | Melee units *block* and *tackle*; the bruiser *trucks* it. |
| Defense "fires" | Defense **throws** (footballs) / **flags** it / **noise** | See Defense Roster — everything throws or shouts, nothing shoots. |
| Rage buff | **Blitz** 🔥 | Keep as-is. Football-native. |
| Medic / heal | **Trainer** ➕ | *Committed choice.* Athletic trainer sprints out with the water bottle / kit. Replaces "Medic" everywhere. |
| Win | **"You silenced the crowd!"** | |
| Defense loss | **"Your house got stormed."** | |
| Loot | **Fans stolen + coins** | See Fan System. |
| Walls | **Blocking Sleds** 🟨 | Hazard-striped practice sleds ringing the base. Obstacles you smash through. |

> **Engineering note:** internal enum values can stay terse (e.g. `sackedPct`, `downMeter`) but **all player-facing strings must use the New column.** No "HP", "damage", "kill", "destroy", "shoot", "gun", "bullet", "turret", "attack" (as a noun in war sense), or "die" in the UI.

---

## 4) Unit Roster (Attackers — your traveling squad)

Cartoon football players in **road uniforms** (your away colors). Chunky, big-headed, Supercell-style cel shading. Each has a clear silhouette so you can read the squad at a glance during a raid.

| Unit | Role | Fantasy | Art read |
|---|---|---|---|
| **Linemen** | Tank / blocker | The wall. Soaks defense, opens lanes for others. High Down-Meter tolerance, low yardage output. | Huge, wide, low stance, forearm pads. Slow bob. |
| **Skill** | Glass cannon (ranged) | The playmaker. **Throws footballs** at buildings from range. Big yards, folds fast if pressured. | Lean, quick, mid-throw pose. Football arcs from hand. |
| **Front 7** | Bruiser (melee) | The enforcer. Wades in and **trucks** buildings up close. High yardage, medium toughness. | Broad-shouldered, helmet down, plowing forward. |
| **Secondary** | Fast skirmisher | The speed guy. Sprints past the front line to harass back-field buildings. Fragile, darty. | Small, fast, exaggerated leg blur / motion lines. |
| **Mascot** *(new)* | Hype unit (support) | Struts onto the field; nearby squad members get **Blitz** ("the crowd goes wild"). Doesn't do much damage itself — it's a walking rage aura. See §7. | Oversized costume character (team animal), foam head, arms up, dancing. Emits little sparkle/hype pulses. |
| **Fan Mob** *(new)* | Cheap swarm | The **traveling tailgate crowd** rushes the field — a wave of everyday supporters in team gear. Individually weak, deadly in numbers. Ties to the **Fans** currency (§8). | A cluster of tiny fans: face paint, foam fingers, jerseys, signs. Deploy as a little pack, not one figure. |

**Balance intent:** Linemen front, Skill behind them lobbing footballs, Front 7 to truck the tough buildings, Secondary to leak into the backfield, Mascot to super-charge a push, Fan Mob to flood and overwhelm. No unit is a "soldier." No unit carries a weapon.

---

## 5) Hero Roster (already in code)

Star players you recruit, train (Hero Academy), and deploy one-per-raid as powerhouse units with a **tappable ability on an ~11s cooldown**. Each renders with real AI-generated character art, gold-bordered marker, and a glow when their ability is up. Heroes get a **gold glow**; Blitz = red glow; Trainer heal = green glow.

| Hero | Nickname | Position | Ability | Fantasy |
|---|---|---|---|---|
| **QB** | *The Franchise* | Quarterback | **Hail Mary** — throws a bomb (arcing football) at a target building for a big burst of yards. | The franchise arm. Launches a prayer downfield that lands like a strike on their building. |
| **RB** | *The Enforcer* | Running back | **Truck Stick** — self-Blitz (2× yards) **+ full Down-Meter refresh** (heals himself). | Lowers the shoulder, trucks everything, shrugs off the hit and keeps churning. |
| **HC** | *The General* | Head coach | **Inspire** — grants **Blitz** to nearby squad members. | Coach on the sideline firing up the unit — everyone around him plays angry. |
| **K** | *The Specialist* | Kicker | **Onside Bomb** — lobs an explosive-hype football for a big **AoE** burst (a pile-up scramble, not an explosion — think confetti-cannon pop). | The trick-play specialist. The onside kick nobody sees coming. |
| **WR** | *The Burner* | Wide receiver | **Jet Sweep** — teleports (blazing sprint) to the nearest building. | 4.3 speed. Blinks across the field on a jet motion to get behind the defense. |

> **Art guardrail for K's "Onside Bomb" and QB's "Hail Mary":** the impact is a **burst of confetti / turf / a football scramble pile-up**, never a fireball, smoke plume, or blast crater. Big *pop*, zero *boom*.

---

## 6) Defense Roster (their home-field advantage)

**Every defense is stadium gear or people — never a weapon.** Defenses **throw footballs, throw penalty flags, launch t-shirts, or make noise.** They *slow, stun, and stop* your squad; they never "kill." A squad member that runs out of Down Meter **jogs off the field** (subbed out), it does not die.

| Defense | Type | What it does | Football fantasy | Projectile / effect |
|---|---|---|---|---|
| **JUGS Machine** | Ranged | Fires at the nearest attacker in range on a cooldown. *(Replaces the old gun turret.)* | The pitching machine that spits footballs — set to "eleven." | **Arcing footballs.** Never a tracer/bullet. |
| **Tackling Sled** | Melee | Stops / slows attackers that get close. | The blocking sled comes alive and stonewalls anyone who reaches it. | Bump / shove; dust puff on contact. |
| **Ref / Coach Tower** | Ranged (control) | Throws penalty flags → **stun/slow** on hit. | The ref booth flags your guys — "holding!" — and they freeze mid-play. | **Yellow penalty flags** (fluttering cloth). Stun ring + a floating 🚩 over the flagged unit. |
| **T-shirt / Gatorade Cannon** | AoE (control) | Comedic area **slow** — soaks/tangles a cluster of attackers. | The between-plays crowd cannon, aimed at your squad instead of the stands. | **T-shirts** (and a Gatorade splash puddle that slows). Purely comedic. |
| **12th Man Crowd Zone** | Aura (control) | A zone of **slow** — crowd noise disrupts your squad. | The student section is so loud your guys can't get the play off. | Concentric **sound-wave rings**, wobbling ground, floating 📣. No projectile. |
| **Enemy Mascot (mini-boss)** | Defensive boss | A tanky roaming defender that body-checks attackers and rallies the home crowd. | Their mascot defends its house — big, goofy, surprisingly hard to move. | Body-check shove; hype pulses that briefly buff nearby defenses. |

**Defense = control, not carnage.** The design language is *slow / stun / stop / annoy*, delivered by footballs, flags, t-shirts, and noise.

---

## 7) Mascot System

The Mascot is the **hype engine** and one of the most on-brand pieces of the whole game. It shows up on both sides:

- **Your Mascot (attacker, §4):** a support unit you send in. It struts (exaggerated dance walk), and every squad member in a radius around it gets **Blitz** — *"the crowd goes wild."* Low personal yardage; its whole job is to make everyone near it play angry. Emits recurring **hype pulses** (sparkle ring) so the buff radius is always legible.
- **Enemy Mascot (defender, §6):** the rival's mascot mini-boss defending its house — tanky, roams, body-checks your squad, and pulses a small buff to nearby home defenses.

**Design intent:** mascots are the comic-relief anchor of the game's tone. Oversized foam-costume animals (team's mascot species), huge heads, tiny expressive hands, always moving. When two mascots meet on the field it should read as a **rivalry dance-off / shove-match**, not a fight. Maximum charm.

**Progression hook (roadmap):** mascots can be leveled at the facility to widen the Blitz radius / strut speed — a natural sink that reinforces the hype fantasy.

---

## 8) Fan System & Currency Tie-in

**Fans** is the game's **secondary currency** (rose/pink Users icon in the HUD). Everything about it should feel like *building a fanbase.*

**How Fans move:**
- **Win a raid → you steal some of their fans.** You silenced their crowd and converted it — those supporters now follow *your* program. This is the emotional payoff of the loot: not "plunder," but *stealing their crowd.*
- **Fans sink — "Rally the Fans":** spend Fans (e.g. 40) to refill your Energy. The fanbase shows up and re-energizes the program.
- **Fan Mob unit ties directly to this currency.** The cheap swarm *is* your fanbase pouring onto the field. Fielding Fan Mobs should feel like spending/leveraging the crowd you've built — the more beloved your program, the bigger the wave you can unleash. (Design intent: Fan Mob availability/size scales with your Fans economy, reinforcing the loop: **win raids → gain fans → rush the field with bigger Fan Mobs → win more raids.**)

**Loot framing on the win screen:** show it as **"+X Fans (stolen crowd)"** and **"+X Coins (gate receipts)"**, scaled by **House Taken %**. Never "plunder," "loot stolen," or "spoils of war."

---

## 9) Projectiles, Motion & Juice

### Projectiles — the whitelist (nothing else may fly)
1. **Footballs** — always **arcing** (gravity lob), spinning spiral. Used by Skill units, JUGS machines, QB Hail Mary, K Onside Bomb.
2. **Penalty flags** — yellow fluttering cloth, short toss, lands with a 🚩. Ref/Coach Tower only.
3. **T-shirts** — tumbling rolled tee, comedic arc. T-shirt/Gatorade Cannon only.

**Banned forever:** bullets, tracers, lasers, missiles, arrows, fire, muzzle flashes, explosions, blood, crosshairs, gun silhouettes, sword icons. The old red "tracer line" from defenses must become a **football arc** or a **flag toss** — never a straight beam.

### Motion & Juice (the game-feel checklist)
Apply liberally — this is what makes it feel alive:

- **Walk-bob** — every unit bobs as it moves (heavier for Linemen, springy for Secondary).
- **Attack lunge** — units lunge forward on a block/tackle/throw, then settle.
- **Hit recoil** — buildings and units flinch/shake when worked (a shove-back, not a wound).
- **Dust puffs** — on footsteps, tackles, and building "sacks."
- **Floating "+YDS" numbers** — pop off buildings as they take yards (the reward feedback). Bigger, gold on Game-Ball thresholds.
- **Crowd wave** — a ripple runs along the field's border stands as a raid progresses; the wave **fades as the house is taken** (fewer fans left cheering).
- **Confetti on win** — full-screen confetti + the crowd going quiet on "You silenced the crowd!"
- **Screen shake** — light, on big hits (Hail Mary landing, a building getting sacked). Keep it juicy, not nauseating.
- **Sacked building** — dims / powers down / droops (a deflating pool-toy, lights off), never rubble or fire.
- **Glows** — Blitz = red, Trainer heal = green, Hero-ability-ready = gold, actionable base building = pulsing yellow ring.

**Audio note:** SFX are synthesized (Web Audio) — whistles, crowd roar, air-horn, "aww" on a sack, band hit on a win. No gunfire, no explosions.

---

## 10) Win / Loss States & Naming

| State | Trigger | Copy | Feel |
|---|---|---|---|
| **Raid win** | You take their HQ (their Stadium) and/or hit the House-Taken threshold. | **"You silenced the crowd!"** | Confetti, band hit, crowd goes quiet, Game Balls tally (1–3 🏈), "+Fans (stolen crowd) / +Coins (gate receipts)." |
| **Raid partial** | Timer ends before full takeover. | **"Road trip's over — X% of their house taken."** | Show Game Balls earned + partial loot. Encouraging, not grim. |
| **Defense loss** | An AI raid takes your base while you're away. | **"Your house got stormed."** | Somber-but-light; show what % and how many Fans/Coins they took. Offer a rematch/"get 'em back" hook (roadmap: revenge). |
| **Defense hold** | Your base repels the raid. | **"Home crowd held the line!"** | Crowd roar, you keep your Fans. |

**Game Balls (the star system):** 1–3 🏈 awarded per raid.
- **1 Game Ball** — you took their HQ (their Stadium).
- **2 Game Balls** — you hit ~50% House Taken.
- **3 Game Balls** — 100% House Taken (you took the whole place — total shutout).

Never "stars," never "victory/defeat" in war terms. Framing is always *road win / got stormed / held the line.*

---

## 11) Tone & Art Guardrails

**The one rule above all:** *ZERO weapons, ZERO violence, ZERO death.* This is a family / youth-football-adjacent brand.

**Do:**
- **Isometric, Clash-style, cel-shaded** cartoon look. Chunky proportions, big heads, bold outlines, saturated team colors, soft drop shadows.
- Keep it **funny.** Mascots, foam fingers, t-shirt cannons, Gatorade dumps, goofy refs. Humor is a feature, not a garnish.
- Make everything **read at a glance** — silhouettes distinct, buffs/debuffs color-coded, projectiles obviously footballs/flags/t-shirts.
- Frame all conflict as **rivalry & crowd energy** — you're taking over their house, converting their fans, silencing their student section.
- Use **stadium/field vocabulary** everywhere: yards, downs, sacked, blitz, timeout, sideline, tunnel, gate receipts, home-field advantage.

**Don't:**
- No guns, turrets, bullets, tracers, lasers, missiles, bombs (the "Onside Bomb" is a *confetti pop*, not an explosive), blood, wounds, gore, crosshairs, sword/gun icons, dog tags, camo, or military ranks.
- No unit ever "dies," "is killed," or "is destroyed" — buildings get **sacked**; players **jog off / get subbed out.**
- No grim, gritty, or dark war aesthetic. If a scene looks like a battlefield, it's wrong — it should look like **a rowdy stadium on game day.**
- No fake stats, fake sponsors, or real-team/real-player likenesses — original teams and mascots only.

**Litmus test for any new art or copy:**
> *Could this run on a Saturday-morning youth-football broadcast without a single parent raising an eyebrow?*
> If not, it does not ship.

---

*Football Headquarters — build the hype, not the war.*

---

## 12) Validated Pillars & Parked Backlog (from the 5-game study, 2026-07)

Research across Clash of Clans, Castle Clash, Boom Beach, and Top Eleven confirmed the
game's four pillars are the right ones. What each study validated, and what it added:

**Already shipped and validated — do not rebuild, only polish:**
- Base layer (Stadium + facilities, revenue/performance payoffs) — Top Eleven's most-loved loop.
- Combat layer — we already run the Boom Beach shape: squad auto-attacks by targeting role;
  the player's skill is deployment choice + Game Plans + hero specials + defense plays
  (our "gunboat energy"). Scout → raid → replay → adjust is live.
- Two currencies + Fans, rival-coach seasons, Live Rivals async PvP + leaderboard.
- Tutorial that teaches the core loop up front (the sin every studied game committed).

**PARKED — good ideas, feature-frozen. Revisit only after Phase D ships:**
1. **All-or-nothing Stadium win condition** (Boom Beach HQ model). Cleaner to read, but
   punishing for new players — Boom Beach's own early-game frustration is the counter-
   evidence. Decide deliberately vs. current loot-per-building + Game Balls. NOT a
   mid-polish swap.
2. **Live/async player auctions** (Top Eleven's signature spend mechanic). Maps onto the
   Supabase PvP backend. Biggest new-feature candidate for the roster layer.
3. **Youth Academy prospect growth** — grow a rookie into a star; extends Scouting Dept.
   The years-long-attachment engine; fixes collection bloat before it exists.
4. **Time-boxed season resets (~28 days) with real rewards per rank** — every league level
   must give something (Top Eleven's hollow-progression sin); never reward tanking.

**Standing lessons absorbed as rules:**
- Keep systems FEW (Castle Clash died of system bloat).
- Social/guild layer is the long-term moat (Boom Beach faded without one) — architect for
  it (Live Rivals already is), build it later.
- Never bury the core mechanic; the tutorial teaches direction-of-squad immediately.
