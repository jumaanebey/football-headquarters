import { EnemyBase, BattleBuildingDef, ENEMY_BASES, HERO_DEFS } from './battle';

// --- SEASON CAMPAIGN: a 12-game ladder from preseason scrubs to the Championship. ---
// The Castle Clash "dungeon" spine: each stage is 3-Game-Ball-rateable, first clears pay
// gems + hero shards (feeding star-ups), and beating a stage unlocks the next. Stages are
// DETERMINISTIC (no RNG) so a loss is a puzzle to solve with a better roster/heroes, not a
// dice re-roll.

export interface CampaignStage {
  stage: number;
  name: string;
  opponent: string;
  mult: number;                              // difficulty multiplier on the template base
  reward: { coins: number; fans: number };   // loot (every run, scaled by destruction)
  firstClear: { gems: number; shardHero: string; shards: number }; // one-time bounty
}

// --- RIVAL COACHES: every opponent is a PERSON with a face and a mouth. They talk
// trash before the game and react after it — the season is a story, not a list.
export interface RivalCoach {
  name: string;    // the coach across the field
  emoji: string;   // face fallback (shows until the portrait art lands)
  art: string;     // portrait PNG — auto-swaps in via the onError pattern when generated
  color: string;   // accent for their card/bubble
  intro: string;   // pre-game trash talk (shown while you set your game plan)
  win: string;     // what they say when YOU beat them
  loss: string;    // their gloat when they stop you
}

const coachArt = (slug: string) => `/assets/coaches/${slug}.png`;

const COACHES: RivalCoach[] = [
  { name: 'Coach "Salty" Pete Grimes', emoji: '🤠', art: coachArt('grimes'), color: '#ca8a04', intro: "New coach, huh? We're the worst team in the league and I STILL like our chances.", win: 'Well… shoot. Kid can coach.', loss: "HA! Beat by the Dust Bowl! Tell everyone." },
  { name: 'Coach Deb Chalmers', emoji: '👩‍🏫', art: coachArt('chalmers'), color: '#0ea5e9', intro: "I've already graded your film. It's a D-minus.", win: 'Hmph. Extra credit earned. This time.', loss: 'As calculated. Study harder, dear.' },
  { name: 'Coach Sal Marino', emoji: '⚓', art: coachArt('marino'), color: '#0891b2', intro: "My Hawks eat rookies for breakfast. You're looking real bite-sized.", win: 'Rough seas… you sailed through us. Respect.', loss: 'Glub glub. Another one sinks in the Harbor!' },
  { name: 'Coach "Binary" Bob Nakamura', emoji: '🤓', art: coachArt('nakamura'), color: '#6366f1', intro: 'My model gives you a 12.7% chance. I rounded UP to be polite.', win: 'Recalibrating… you broke my model. Impressive.', loss: 'The math never lies. 87.3%, as predicted.' },
  { name: 'Coach June Wilder', emoji: '🐆', art: coachArt('wilder'), color: '#d97706', intro: "Pumas hunt in the open field. Hope your slow boys can run.", win: "Fast AND tough. Fine — you've earned the plains.", loss: 'Told you. Never outrun a Puma.' },
  { name: 'Coach "Icebox" Olsen', emoji: '🥶', art: coachArt('olsen'), color: '#38bdf8', intro: "Midseason's where pretenders freeze. Bundle up, kid.", win: 'You… thawed us out. Nobody does that.', loss: 'Frozen solid at midfield. Classic.' },
  { name: 'Coach Remy LaRoux', emoji: '🐊', art: coachArt('laroux'), color: '#16a34a', intro: "Welcome to the Bayou, cher. Ain't nobody leaves with their lunch money.", win: "Sacre bleu… take the lunch money. You earned it.", loss: 'The swamp keeps what it catches, cher.' },
  { name: 'Coach "Bricks" Kowalski', emoji: '🧱', art: coachArt('kowalski'), color: '#78716c', intro: "Iron City don't do finesse. We're gonna lean on you 'til you quit.", win: 'You hit harder than my whole front line. Ouch.', loss: 'Another soft team bounces off the wall.' },
  { name: 'Coach Vince Deluxe', emoji: '🕶️', art: coachArt('deluxe'), color: '#a855f7', intro: 'Big lights, big stage. You sure you belong on Metro turf, kid?', win: "Bright lights suit you. Don't let it go to your head.", loss: 'Stick to the small towns, sweetheart.' },
  { name: 'Coach Sterling Cross', emoji: '👑', art: coachArt('cross'), color: '#eab308', intro: 'The Knights have never lost a Divisional at home. Tradition is armor.', win: 'The crown… slips. Wear it well, coach.', loss: 'Tradition holds. It always holds.' },
  { name: 'Coach Vera Voss', emoji: '🩸', art: coachArt('voss'), color: '#b91c1c', intro: "The Empire doesn't rebuild. It reloads. You're just the next target.", win: 'An Empire falls. Savor it — I would.', loss: 'The Empire feeds on hope like yours.' },
  { name: 'Coach Marcus "The GOAT" Hale', emoji: '🐐', art: coachArt('hale'), color: '#f97316', intro: "Eleven rings. Nobody remembers second place. You won't even be a footnote.", win: 'Twelve teams tried. One finished it. Take the ring — you ARE the story now.', loss: 'And THAT is why they call me the GOAT.' },
];

export const coachForStage = (stage: number): RivalCoach => COACHES[(stage - 1) % COACHES.length];

// Generic scrimmage-coach pool for raid targets — deterministic by base name so the
// same rival always talks the same trash.
const RAID_COACHES: RivalCoach[] = [
  { name: 'Coach Buck Tanner', emoji: '😤', art: coachArt('tanner'), color: '#dc2626', intro: "You picked the wrong stadium to raid, son.", win: 'Take the coins. I want a rematch.', loss: 'Not in MY house!' },
  { name: 'Coach Rosa Vega', emoji: '😏', art: coachArt('vega'), color: '#db2777', intro: "Cute little squad. Watch them get flattened.", win: "Okay, okay. The squad's not so little.", loss: 'Flattened. Like I said.' },
  { name: 'Coach Duke Holloway', emoji: '🧐', art: coachArt('holloway'), color: '#7c3aed', intro: 'I schemed all week for exactly this.', win: 'Back to the drawing board…', loss: 'Schemed. Executed. Handled.' },
  { name: 'Coach Mabel Frost', emoji: '😈', art: coachArt('frost'), color: '#0284c7', intro: "My defense hasn't given up a TD in weeks.", win: 'The streak… THE STREAK!', loss: 'And the streak lives on.' },
  { name: 'Coach Tony Two-Times', emoji: '🤨', art: coachArt('twotimes'), color: '#ea580c', intro: "I'll say it twice: go home. GO HOME.", win: "I'll say it once: well played.", loss: 'Told ya twice. TOLD YA TWICE.' },
  { name: 'Coach Grandma Hux', emoji: '👵', art: coachArt('hux'), color: '#65a30d', intro: "Sweetie, I've been beating hotshots since before you were born.", win: "Fine, you get a cookie. ONE cookie.", loss: 'Respect your elders, dear.' },
];

export const coachForBase = (baseName: string): RivalCoach => {
  let h = 0;
  for (let i = 0; i < baseName.length; i++) h = (h * 31 + baseName.charCodeAt(i)) >>> 0;
  return RAID_COACHES[h % RAID_COACHES.length];
};

/** Warm the browser cache for all 18 coach portraits so Game Day never opens to a
 *  wall of empty circles. Called once from App on an idle tick after boot. */
export const preloadCoachArt = (): void => {
  for (const c of [...COACHES, ...RAID_COACHES]) { const img = new Image(); img.src = c.art; }
};

const SCHEDULE: [string, string][] = [
  ['Preseason Opener', 'Dust Bowl Prospects'],
  ['Week 2', 'Valley State'],
  ['Week 3', 'Harbor Hawks'],
  ['Week 4', 'Tech University'],
  ['Week 5', 'Prairie Pumas'],
  ['Midseason Clash', 'North Sharks'],
  ['Week 7', 'Bayou Bandits'],
  ['Week 8', 'Iron City'],
  ['Week 9', 'Metro Mustangs'],
  ['Divisional Round', 'Golden Knights'],
  ['Conference Final', 'Crimson Empire'],
  ['THE CHAMPIONSHIP', 'The Dynasty'],
];

export const CAMPAIGN_STAGES: CampaignStage[] = SCHEDULE.map(([name, opponent], i) => {
  const stage = i + 1;
  // Exponential: player power compounds (levels × stars × roster), so the season must too.
  // Balance-sim tuned: T0 clears ~s1-5, T1 ~s7, T2 ~s9, T3 ~s11, only T4 takes the Championship.
  const mult = Math.round(0.55 * Math.pow(1.34, i) * 100) / 100; // 0.55 → ~13.8
  return {
    stage, name, opponent, mult,
    reward: { coins: Math.round(300 + 240 * mult), fans: Math.round(10 + 9 * mult) },
    firstClear: {
      gems: 6 + stage * 2,                                    // 8 → 30 gems across the season
      shardHero: HERO_DEFS[i % HERO_DEFS.length].key,          // every hero gets fed across 12 weeks
      shards: 8 + stage * 2,
    },
  };
});

/** Build the deterministic battle layout for a stage: scaled template + extra defenses late. */
export const campaignBase = (stage: number): EnemyBase => {
  const st = CAMPAIGN_STAGES[stage - 1];
  const template = ENEMY_BASES[(stage - 1) % ENEMY_BASES.length];
  // Turret lethality scales superlinearly (attacker power compounds); loot buildings stay linear.
  const tDmg = Math.round(13 * Math.pow(st.mult, 1.25));
  const buildings: BattleBuildingDef[] = template.buildings.map(b => ({
    ...b,
    hp: Math.round(b.hp * st.mult),
    damage: b.damage ? tDmg : b.damage,
  }));
  // Late-season teams field extra coverage — more turrets, not just bigger HP bars.
  const extraSpots: [number, number][] = [[30, 50], [70, 50], [50, 32], [50, 68], [38, 62]];
  const extras = stage >= 11 ? 5 : stage >= 9 ? 4 : stage >= 7 ? 3 : stage >= 5 ? 2 : stage >= 3 ? 1 : 0;
  const flavors: BattleBuildingDef['flavor'][] = ['ref', 'tshirt', 'sled', 'tshirt', 'ref']; // late-season coverage has personality
  for (let e = 0; e < extras; e++) {
    const [x, y] = extraSpots[e];
    buildings.push({ id: `cd${e}`, kind: 'defense', flavor: flavors[e], x, y, hp: Math.round(230 * st.mult), size: 5, damage: tDmg, range: 23 });
  }
  return { id: `camp_${stage}`, name: st.opponent, difficulty: st.mult, reward: st.reward, buildings };
};

// ─── RIVAL CRESTS (Round 10) ──────────────────────────────────────────────────
// 8 emblems in public/assets/rivals/. Schedule teams with a namesake crest get it
// outright; everything else (raid bots, live rivals) hash-assigns deterministically
// so the same team always flies the same flag.
const RIVAL_CREST_SLUGS = ['sharks', 'bandits', 'iron', 'mustangs', 'knights', 'empire', 'pumas', 'hawks'];
const CREST_BY_TEAM: Record<string, string> = {
  'North Sharks': 'sharks', 'Bayou Bandits': 'bandits', 'Iron City': 'iron', 'Metro Mustangs': 'mustangs',
  'Golden Knights': 'knights', 'Crimson Empire': 'empire', 'Prairie Pumas': 'pumas', 'Harbor Hawks': 'hawks',
};
export const crestForTeam = (teamName: string): string => {
  const named = CREST_BY_TEAM[teamName];
  if (named) return `/assets/rivals/crest-${named}.png`;
  let h = 0;
  for (let i = 0; i < teamName.length; i++) h = (h * 31 + teamName.charCodeAt(i)) >>> 0;
  return `/assets/rivals/crest-${RIVAL_CREST_SLUGS[h % RIVAL_CREST_SLUGS.length]}.png`;
};
