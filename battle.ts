import { UnitGroup, Player, BuildingInstance, BuildingType } from './types';
import { WALL_HP, TENDENCIES, TendencyKey, DEFENSE_TYPES, PARKING_LOT } from './constants';
import { buildingSprite } from './assets';

// ---------------------------------------------------------------------------
// Real-time attack model (Clash-of-Clans-style). World is a 100x100 square.
// ---------------------------------------------------------------------------

export type BuildingKind = 'hq' | 'defense' | 'building' | 'wall';

export interface BattleBuildingDef {
  id: string;
  kind: BuildingKind;
  x: number;         // world coords 0..100
  y: number;
  hp: number;
  size: number;      // footprint radius-ish in world units
  damage?: number;   // dps (defense only)
  range?: number;    // world units (defense only)
  flavor?: 'jugs' | 'sled' | 'ref' | 'tshirt'; // HOW this turret fights (defaults to jugs behavior)
  /** Sprite path of the REAL building (type + level art) so the defense view shows
   *  the same base you built — not a hash-picked stand-in. Absent on old published
   *  bases and bot bases → renderer falls back to the pool art. */
  art?: string;
  /** On the HQ entry only: the defender's formation key — lets the attacker's sim
   *  apply plan-vs-formation counterplay. Absent (old rows, bots) = no modifier. */
  formation?: string;
}

export interface EnemyBase {
  id: string;
  name: string;
  difficulty: number;
  reward: { coins: number; fans: number };
  buildings: BattleBuildingDef[];
}

// Live battle entities (mutated during the sim).
export interface BBuilding extends BattleBuildingDef {
  maxHp: number;
  dead: boolean;
  cooldown: number; // seconds until next shot (defense)
}

export interface BTroop {
  id: string;
  unit: UnitGroup;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dps: number;
  speed: number;   // world units / sec
  range: number;   // world units
  targetId: string | null;
  dead: boolean;
  hitFlash: number; // seconds of damage-flash remaining
  rageT: number;    // seconds of Rage (2x dmg, 1.5x speed) remaining
  healT: number;    // seconds of Heal remaining
  shieldT?: number; // seconds of Shield Wall (incoming damage halved) remaining
  slowT?: number;   // seconds of penalty-flag slow (Ref Tower) remaining
  isHero?: boolean;
  heroKey?: string;
  ability?: 'hailmary' | 'truckstick' | 'motivation' | 'onside_bomb' | 'burner_dash' | 'field_medic' | 'shield_wall' | 'trick_play' | 'hall_of_fame';
  abilityCd?: number; // seconds until ability ready (0 = ready)
  attacking?: boolean; // true this tick if in range and hitting a target (drives lunge anim)
  special?: SpecialKind; // set for Mascot / Fan-Mob support units
  jersey?: number;     // individual jersey number (each deployed player is their own person)
  dmg?: number;        // total damage dealt this battle (drives the MVP award)
  kills?: number;      // defenders pancaked by this player
  dmgAcc?: number;     // damage accumulated since the last floating number popped
  dmgTimer?: number;   // seconds since the last floating number
  plan?: PathPlan;     // current wall-aware route (sim-transient, never persisted)
}

// Troop archetypes per position group.
// Colors are on the home-team identity (steel / orange / charcoal / gold) — see ART-DIRECTION.md.
export const TROOP_STATS: Record<UnitGroup, { hp: number; dps: number; speed: number; range: number; label: string; color: string; emoji: string; hint: string }> = {
  [UnitGroup.OFFENSE_LINE]:      { hp: 280, dps: 14, speed: 9,  range: 4,  label: 'Linemen',   color: '#475569', emoji: '🛡️', hint: 'tanks — soak up the defense' },       // steel
  [UnitGroup.OFFENSE_SKILL]:     { hp: 95,  dps: 34, speed: 15, range: 7,  label: 'Skill',     color: '#f97316', emoji: '⚡', hint: 'hunt loot & the stadium' },            // team orange
  [UnitGroup.DEFENSE_LINE]:      { hp: 175, dps: 24, speed: 11, range: 4,  label: 'Front 7',   color: '#1f2937', emoji: '💥', hint: 'BLITZ defensive gear first' },         // charcoal
  [UnitGroup.DEFENSE_SECONDARY]: { hp: 90,  dps: 22, speed: 17, range: 8,  label: 'Secondary', color: '#eab308', emoji: '🏃', hint: 'fast — race to open loot' },           // gold
};

// TARGETING ROLES: each position group goes after what it's built for, so WHICH players
// you send (and where) is a real decision — not just how many.
export type TargetPref = { kind: 'defense' | 'loot'; w: number };
export const UNIT_PREF: Record<UnitGroup, TargetPref> = {
  [UnitGroup.OFFENSE_LINE]:      { kind: 'defense', w: 0.75 }, // tanks lean toward turrets to soak
  [UnitGroup.OFFENSE_SKILL]:     { kind: 'loot',    w: 0.6 },  // playmakers go for the score
  [UnitGroup.DEFENSE_LINE]:      { kind: 'defense', w: 0.5 },  // the blitz — hunts equipment hard
  [UnitGroup.DEFENSE_SECONDARY]: { kind: 'loot',    w: 0.75 }, // fast flankers race to open buildings
};

export const UNIT_ORDER: UnitGroup[] = [
  UnitGroup.OFFENSE_LINE,
  UnitGroup.OFFENSE_SKILL,
  UnitGroup.DEFENSE_LINE,
  UnitGroup.DEFENSE_SECONDARY,
];

// --- GAME PLANS: the pre-snap coaching call. Locked in before your first player
// takes the field; every unit you send in plays to the scheme. Real trade-offs —
// there is no strictly-best plan, only the right plan for the base you're hitting.
export type GamePlanKey = 'ground' | 'balanced' | 'air';
export interface GamePlanDef {
  key: GamePlanKey; name: string; emoji: string; blurb: string;
  hp: number; dps: number; speed: number; momentum: number; // multipliers
}
export const GAME_PLANS: GamePlanDef[] = [
  { key: 'ground',   name: 'Ground & Pound', emoji: '🐂', blurb: 'Tough +30% HP · slower',        hp: 1.30, dps: 1.0,  speed: 0.85, momentum: 1.0 },
  { key: 'balanced', name: 'Balanced',       emoji: '📋', blurb: 'Momentum builds 40% faster',    hp: 1.0,  dps: 1.0,  speed: 1.0,  momentum: 1.4 },
  { key: 'air',      name: 'Air Raid',       emoji: '🚀', blurb: '+20% DMG +25% speed · fragile', hp: 0.75, dps: 1.20, speed: 1.25, momentum: 1.0 },
];

/** Build the deployable army from the current roster: one troop per player, grouped. */
export const armyFromRoster = (roster: Player[]): Record<UnitGroup, number> => {
  const counts = {
    [UnitGroup.OFFENSE_LINE]: 0,
    [UnitGroup.OFFENSE_SKILL]: 0,
    [UnitGroup.DEFENSE_LINE]: 0,
    [UnitGroup.DEFENSE_SECONDARY]: 0,
  };
  roster.forEach(p => { counts[p.unit] = (counts[p.unit] || 0) + 1; });
  return counts;
};

export const playerOvr = (p: Player) => (p.stats.strength + p.stats.speed + p.stats.iq) / 3;

// --- HEROES: your best players, as powerful ability units ---
export interface RaidHero {
  key: string;
  name: string;
  ability: 'hailmary' | 'truckstick' | 'motivation' | 'onside_bomb' | 'burner_dash' | 'field_medic' | 'shield_wall' | 'trick_play' | 'hall_of_fame';
  abilityName: string;
  abilityDesc: string;
  unit: UnitGroup;
  hp: number;
  dps: number;
  speed: number;
  range: number;
  color: string;
  emoji: string;
  art: string;
  level?: number;
}

// Persistent, trainable star heroes (art generated to match the game style).
// `unlock` omitted = a starter hero (already owned). Otherwise it costs coins or gems to unlock.
export interface HeroDef {
  key: string; name: string; role: string; unit: UnitGroup;
  ability: 'hailmary' | 'truckstick' | 'motivation' | 'onside_bomb' | 'burner_dash' | 'field_medic' | 'shield_wall' | 'trick_play' | 'hall_of_fame'; abilityName: string; abilityDesc: string;
  baseHp: number; baseDps: number; speed: number; range: number;
  color: string; emoji: string; art: string;
  unlock?: { coins?: number; gems?: number };
  starter?: boolean;
}
export const HERO_DEFS: HeroDef[] = [
  // --- Starters (owned from the start) ---
  { key: 'qb', name: 'The Franchise', role: 'QB', unit: UnitGroup.OFFENSE_SKILL, ability: 'hailmary', abilityName: 'Hail Mary', abilityDesc: 'Bomb a building from range', baseHp: 240, baseDps: 28, speed: 13, range: 9, color: '#f59e0b', emoji: '🎯', art: '/assets/heroes/qb.png', starter: true },
  { key: 'enforcer', name: 'The Enforcer', role: 'RB', unit: UnitGroup.DEFENSE_LINE, ability: 'truckstick', abilityName: 'Truck Stick', abilityDesc: 'Rage: 2× damage + full heal', baseHp: 460, baseDps: 24, speed: 10, range: 4, color: '#7c3aed', emoji: '🚛', art: '/assets/heroes/enforcer.png', starter: true },
  { key: 'coach', name: 'The General', role: 'HC', unit: UnitGroup.OFFENSE_LINE, ability: 'motivation', abilityName: 'Inspire', abilityDesc: 'Give nearby troops 4s of Rage', baseHp: 380, baseDps: 18, speed: 8, range: 4, color: '#10b981', emoji: '📋', art: '/assets/heroes/coach.png', starter: true },
  { key: 'kicker', name: 'The Specialist', role: 'K', unit: UnitGroup.OFFENSE_SKILL, ability: 'onside_bomb', abilityName: 'Onside Bomb', abilityDesc: 'Lob an explosive ball dealing 600 damage', baseHp: 190, baseDps: 35, speed: 12, range: 12, color: '#3b82f6', emoji: '🏈', art: '/assets/heroes/kicker.png', starter: true },
  { key: 'burner', name: 'The Burner', role: 'WR', unit: UnitGroup.OFFENSE_SKILL, ability: 'burner_dash', abilityName: 'Jet Sweep', abilityDesc: 'Teleport to nearest building', baseHp: 220, baseDps: 32, speed: 18, range: 5, color: '#ef4444', emoji: '🔥', art: '/assets/heroes/burner.png', starter: true },
  // --- Unlockable heroes (coin-gated) — distinct support roles, incl. women ---
  { key: 'medic', name: 'Dr. Sloane', role: 'Team Doc', unit: UnitGroup.DEFENSE_SECONDARY, ability: 'field_medic', abilityName: 'Field Medic', abilityDesc: 'Heal all nearby players for a big chunk + regen', baseHp: 300, baseDps: 10, speed: 13, range: 6, color: '#22c55e', emoji: '⛑️', art: '/assets/heroes/medic.png', unlock: { coins: 8000 } },
  { key: 'captain', name: 'The Captain', role: 'S', unit: UnitGroup.DEFENSE_SECONDARY, ability: 'shield_wall', abilityName: 'Shield Wall', abilityDesc: 'Nearby players take half damage for 5s', baseHp: 440, baseDps: 16, speed: 11, range: 4, color: '#0ea5e9', emoji: '🛡️', art: '/assets/heroes/captain.png', unlock: { coins: 14000 } },
  { key: 'playmaker', name: 'The Playmaker', role: 'WR', unit: UnitGroup.OFFENSE_SKILL, ability: 'trick_play', abilityName: 'Trick Play', abilityDesc: 'Summon a burst of skill players onto the field', baseHp: 250, baseDps: 30, speed: 16, range: 7, color: '#ec4899', emoji: '🎩', art: '/assets/heroes/playmaker.png', unlock: { coins: 20000 } },
  // --- Premium pay-to-unlock hero (gems) — the GOAT ---
  { key: 'legend', name: 'The Legend', role: 'GOAT', unit: UnitGroup.OFFENSE_SKILL, ability: 'hall_of_fame', abilityName: 'Hall of Fame', abilityDesc: 'Rage + full heal for your ENTIRE squad', baseHp: 520, baseDps: 40, speed: 14, range: 8, color: '#a855f7', emoji: '👑', art: '/assets/heroes/legend.png', unlock: { gems: 120 } },
];
export const STARTER_HERO_KEYS = HERO_DEFS.filter(h => h.starter).map(h => h.key);
export const heroLevelMult = (level: number) => 1 + 0.25 * (level - 1);
// Star evolution (Castle Clash-style): each star past the first is a big multiplicative jump,
// so star-ups feel like real power spikes on top of steady level grind. 5★ = ×2.4.
export const heroStarMult = (stars: number) => 1 + 0.35 * (Math.max(1, stars) - 1);
export const heroUpgradeCost = (level: number) => Math.round(600 * Math.pow(1.55, level - 1));

export const heroForBattle = (def: HeroDef, level: number, stars = 1): RaidHero => {
  const m = heroLevelMult(level) * heroStarMult(stars);
  return {
    key: def.key, name: def.name, ability: def.ability, abilityName: def.abilityName, abilityDesc: def.abilityDesc,
    unit: def.unit, hp: Math.round(def.baseHp * m), dps: def.baseDps * m, speed: def.speed, range: def.range,
    color: def.color, emoji: def.emoji, art: def.art, level,
  };
};
// Only UNLOCKED heroes can be fielded in a raid.
export const heroesForBattle = (heroStates: { key: string; level: number; unlocked?: boolean; stars?: number }[]): RaidHero[] =>
  heroStates
    .filter(hl => hl.unlocked !== false) // treat undefined as unlocked (back-compat with old saves)
    .map(hl => { const def = HERO_DEFS.find(d => d.key === hl.key); return def ? heroForBattle(def, hl.level, hl.stars ?? 1) : null; })
    .filter(Boolean) as RaidHero[];

// Heroes can level generously above your Stadium so the game stays hero-focused.
export const heroMaxLevel = (stadiumLevel: number) => stadiumLevel + 5;

export const ABILITY_CD = 11;      // seconds between hero ability uses
export const RAGE_SECONDS = 5;
export const HEAL_SECONDS = 4;
export const HEAL_PER_SEC = 45;

// --- PLAYBOOK: castable spells during a raid ---
export interface PlayDef {
  key: 'blitz' | 'medic';
  name: string;
  desc: string;
  charges: number;
  radius: number;
  color: string;
  emoji: string;
}
export const PLAYBOOK: PlayDef[] = [
  { key: 'blitz', name: 'Blitz', desc: 'Rage nearby troops — 2× damage & speed', charges: 2, radius: 22, color: '#dc2626', emoji: '🔥' },
  { key: 'medic', name: 'Trainer', desc: 'Athletic trainer patches up nearby players', charges: 2, radius: 22, color: '#16a34a', emoji: '➕' },
];

// --- SPECIAL SUPPORT UNITS: Mascot (hype aura) + Fan Mob (swarm) ---
export type SpecialKind = 'mascot' | 'fan';
export interface SpecialDef {
  key: SpecialKind;
  name: string;
  desc: string;
  count: number;    // troops spawned per deploy (Fan Mob = a swarm)
  charges: number;  // deploys available this battle
  hp: number; dps: number; speed: number; range: number;
  aura?: { radius: number; keepRageT: number }; // Mascot: tops up nearby troops' Rage each tick
  color: string; emoji: string; art: string;
}
export const SPECIALS: SpecialDef[] = [
  // The team mascot struts in, soaks hits, and keeps everyone near it Raging ("crowd goes wild").
  { key: 'mascot', name: 'Mascot', desc: 'Struts in and hypes nearby players — Rage aura', count: 1, charges: 1, hp: 520, dps: 8, speed: 9, range: 4, aura: { radius: 16, keepRageT: 1.1 }, color: '#f97316', emoji: '🐯', art: '/assets/units/mascot.png' },
  // A cheap, fast, fragile swarm — the tailgate crowd storming the field.
  { key: 'fan',    name: 'Fan Mob', desc: 'A swarm of rowdy fans storms the field', count: 5, charges: 2, hp: 45, dps: 9, speed: 16, range: 3, color: '#fb923c', emoji: '📣', art: '/assets/units/fan-mob.png' },
];

/** Specials available for a raid. Fan Mob charges scale with your fanbase (the Fans currency). */
export const specialsForBattle = (fans: number): SpecialDef[] =>
  SPECIALS.map(sp => sp.key === 'fan'
    ? { ...sp, charges: 1 + Math.min(3, Math.floor(fans / 500)) } // more fans → more mobs
    : sp);

/**
 * Per-group troop strength multiplier from the roster's average OVR — so training
 * and recruiting better players makes your raids hit harder (baseline OVR 10 = 1x).
 */
export const armyStrength = (roster: Player[]): Record<UnitGroup, number> => {
  const acc: Record<UnitGroup, { t: number; n: number }> = {
    [UnitGroup.OFFENSE_LINE]: { t: 0, n: 0 },
    [UnitGroup.OFFENSE_SKILL]: { t: 0, n: 0 },
    [UnitGroup.DEFENSE_LINE]: { t: 0, n: 0 },
    [UnitGroup.DEFENSE_SECONDARY]: { t: 0, n: 0 },
  };
  // Offense-leaning Tendencies sharpen a group's raid power (+6% per Blitzer/Playmaker in the
  // group, +3% per balanced player) — so WHO you roster changes HOW you hit, not just how hard.
  const tBonus: Record<UnitGroup, number> = {
    [UnitGroup.OFFENSE_LINE]: 0, [UnitGroup.OFFENSE_SKILL]: 0,
    [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0,
  };
  roster.forEach(p => {
    acc[p.unit].t += playerOvr(p); acc[p.unit].n += 1;
    const side = TENDENCIES[p.tendency as TendencyKey]?.side;
    if (side === 'offense') tBonus[p.unit] += 0.06;
    else if (side === 'balanced') tBonus[p.unit] += 0.03;
  });
  const out = {} as Record<UnitGroup, number>;
  (Object.keys(acc) as UnitGroup[]).forEach(u => {
    const avg = acc[u].n ? acc[u].t / acc[u].n : 10;
    out[u] = Math.max(1, Math.min(4.5, (avg / 10) * (1 + tBonus[u])));
  });
  return out;
};

export const BATTLE_SECONDS = 60;

// Hand-designed enemy bases of increasing difficulty.
export const ENEMY_BASES: EnemyBase[] = [
  {
    id: 'valley', name: 'Valley State', difficulty: 1, reward: { coins: 700, fans: 30 },
    buildings: [
      { id: 'hq',  kind: 'hq',       x: 50, y: 50, hp: 480, size: 8, formation: 'goalline' },
      { id: 'd1',  kind: 'defense',  x: 32, y: 34, hp: 200, size: 5, damage: 16, range: 22 },
      { id: 'd2',  kind: 'defense',  x: 68, y: 66, hp: 200, size: 5, damage: 16, range: 22 },
      { id: 'b1',  kind: 'building', x: 30, y: 66, hp: 150, size: 5 },
      { id: 'b2',  kind: 'building', x: 68, y: 32, hp: 150, size: 5 },
      { id: 'b3',  kind: 'building', x: 50, y: 26, hp: 150, size: 5 },
      // Blocking Sleds ringing the HQ (radius ~13 so they enclose, not overlap, the stadium)
      { id: 'w1', kind: 'wall', x: 63, y: 50, hp: 200, size: 4 }, { id: 'w2', kind: 'wall', x: 59, y: 59, hp: 200, size: 4 },
      { id: 'w3', kind: 'wall', x: 50, y: 63, hp: 200, size: 4 }, { id: 'w4', kind: 'wall', x: 41, y: 59, hp: 200, size: 4 },
      { id: 'w5', kind: 'wall', x: 37, y: 50, hp: 200, size: 4 }, { id: 'w6', kind: 'wall', x: 41, y: 41, hp: 200, size: 4 },
      { id: 'w7', kind: 'wall', x: 50, y: 37, hp: 200, size: 4 }, { id: 'w8', kind: 'wall', x: 59, y: 41, hp: 200, size: 4 },
    ],
  },
  {
    id: 'tech', name: 'Tech University', difficulty: 2, reward: { coins: 1400, fans: 55 },
    buildings: [
      { id: 'hq',  kind: 'hq',       x: 50, y: 50, hp: 620, size: 8, formation: 'cover3' },
      { id: 'd1',  kind: 'defense',  x: 28, y: 30, hp: 260, size: 5, damage: 20, range: 24 },
      { id: 'd2',  kind: 'defense',  x: 72, y: 30, hp: 260, size: 5, damage: 20, range: 24 },
      { id: 'd3',  kind: 'defense',  x: 50, y: 74, hp: 260, size: 5, damage: 20, range: 24 },
      { id: 'b1',  kind: 'building', x: 28, y: 62, hp: 180, size: 5 },
      { id: 'b2',  kind: 'building', x: 72, y: 62, hp: 180, size: 5 },
      { id: 'b3',  kind: 'building', x: 31, y: 46, hp: 180, size: 5 },
      { id: 'b4',  kind: 'building', x: 69, y: 46, hp: 180, size: 5 },
      // Wall ring around the HQ (radius ~13 so it encloses, not overlaps, the stadium)
      { id: 'w1', kind: 'wall', x: 63, y: 50, hp: 260, size: 4 }, { id: 'w2', kind: 'wall', x: 59, y: 59, hp: 260, size: 4 },
      { id: 'w3', kind: 'wall', x: 50, y: 63, hp: 260, size: 4 }, { id: 'w4', kind: 'wall', x: 41, y: 59, hp: 260, size: 4 },
      { id: 'w5', kind: 'wall', x: 37, y: 50, hp: 260, size: 4 }, { id: 'w6', kind: 'wall', x: 41, y: 41, hp: 260, size: 4 },
      { id: 'w7', kind: 'wall', x: 50, y: 37, hp: 260, size: 4 }, { id: 'w8', kind: 'wall', x: 59, y: 41, hp: 260, size: 4 },
    ],
  },
];

// --- DEFENSE: turn the player's economic base into a defendable battle layout ---
// Stadium = HQ, Rehab/Scouting = active defenses (fire at raiders), rest = loot targets.
// Everything scales with building level, so upgrading your base makes it tougher.
// A base to attack for REVENGE against a rival — the Tech University layout scaled by the
// rival's defense rating, so tougher teams have tougher houses to storm back.
export const makeRevengeBase = (defenseRating: number): BattleBuildingDef[] => {
  const scale = 0.7 + defenseRating / 90; // Valley(35)≈1.09 .. Golden(85)≈1.64
  const template = ENEMY_BASES[1].buildings; // Tech University (has a wall ring)
  return template.map(b => ({
    ...b,
    hp: Math.round(b.hp * scale),
    damage: b.damage ? Math.round(b.damage * scale) : b.damage,
  }));
};

// Fresh, trophy-scaled raid targets — so you climb the ladder against new rivals each time
// instead of farming the same two bases.
const RIVAL_NAMES = ['Riverside Rams', 'Coastal Cobras', 'Mesa Mavericks', 'Summit Stags', 'Delta Dragons', 'Harbor Hawks', 'Canyon Cougars', 'Prairie Pumas', 'Bayou Bandits', 'Ridge Raiders', 'Metro Mustangs', 'Vista Vipers'];

export const generateRaidTargets = (trophies: number): EnemyBase[] => {
  // Superlinear with the ladder (player power compounds via hero levels × stars), and higher
  // brackets field MORE turrets, not just fatter HP bars. Balance-sim tuned to ~60-75% win rates.
  const base = 1.0 + trophies / 300 + Math.pow(trophies / 750, 1.7);
  return Array.from({ length: 3 }, (_, i) => {
    const tier = Math.max(0.9, base * (0.85 + i * 0.2) + Math.random() * 0.3); // easy/fair/spicy
    const template = ENEMY_BASES[i % ENEMY_BASES.length];
    // Loot targets scale linearly, but turret LETHALITY scales superlinearly — attacker power
    // compounds (levels × stars × roster), so defenses must actually kill units at high tiers.
    const tDmg = Math.round(14 * Math.pow(tier, 1.3));
    // Every bot RUNS A SCHEME too — the ladder teaches plan-vs-formation counterplay
    // before you ever meet a live rival. Harder tiers call smarter schemes.
    const botFormation = tier >= 2.2 ? 'maxprotect' : tier >= 1.4 ? 'cover3' : 'goalline';
    const buildings = template.buildings.map(b => ({ ...b, hp: Math.round(b.hp * tier), damage: b.damage ? tDmg : b.damage, formation: b.kind === 'hq' ? botFormation : undefined }));
    const extraSpots: [number, number][] = [[30, 50], [70, 50], [50, 30], [50, 70], [38, 64]];
    const extras = Math.min(5, Math.floor(tier / 1.4));
    const flavors: BattleBuildingDef['flavor'][] = ['tshirt', 'ref', 'sled', 'tshirt', 'ref']; // varied looks at higher tiers
    for (let e = 0; e < extras; e++) {
      const [x, y] = extraSpots[e];
      buildings.push({ id: `xd${e}`, kind: 'defense', flavor: flavors[e], x, y, hp: Math.round(220 * tier), size: 5, damage: tDmg, range: 23 });
    }
    return {
      id: `mm_${i}_${Math.floor(Math.random() * 99999)}`,
      name: RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)],
      difficulty: Math.round(tier * 10) / 10,
      reward: { coins: Math.round(420 * tier + 250), fans: Math.round(14 * tier + 6) },
      buildings,
    };
  });
};

// `defBoost` (from your roster's defensive Tendencies — see defense.ts) toughens every
// structure: an Anchor/Iron Wall-heavy roster literally makes your stadium harder to break.
// FIXED BASE: `defenses` come from the fixed emplacements (fixedBase.ts) with a LEVEL —
// upgrading a slot is the strategy now; `level` scales its HP (+12%/lvl) and damage
// (+10%/lvl). `wallHp` scales with the Stadium (wallHpFor) — walls have no UI at all.
export const defenseLayoutFromBase = (buildings: BuildingInstance[], walls: { gridX: number; gridY: number }[] = [], defBoost = 1, defenses: { id: string; kind: string; gridX: number; gridY: number; level?: number }[] = [], bus: { gridX: number; gridY: number } | null = null, parkingLot = 0, wallHp = WALL_HP, formation?: string): BattleBuildingDef[] => {
  // 🅿️ Parking Lot: compress the whole base toward center — attackers deploy at the
  // same perimeter but everything they want is farther away, so your turrets, crowd,
  // and defenders get more time on them. (Positions squeeze ~5.5%/level toward 50,50.)
  const squeeze = 1 - PARKING_LOT.compressPerLevel * Math.min(PARKING_LOT.maxLevel, Math.max(0, parkingLot));
  const cx = (v: number) => 50 + (v - 50) * squeeze;
  const bs: BattleBuildingDef[] = buildings.map(b => {
    // 2×2 footprint → the battle entity sits at the footprint CENTER (anchor tile + half).
    const x = cx(Math.min(86, Math.max(14, b.gridX * 10 + 5)));
    const y = cx(Math.min(86, Math.max(14, b.gridY * 10 + 5)));
    const lvl = b.level;
    const art = buildingSprite(b.type, lvl); // defense view shows YOUR actual building art
    if (b.type === BuildingType.STADIUM)
      return { id: b.id, kind: 'hq', x, y, hp: Math.round(500 * (1 + 0.35 * (lvl - 1)) * defBoost), size: 8, art, formation };
    if (b.type === BuildingType.MEDICAL_CENTER || b.type === BuildingType.YOUTH_ACADEMY)
      return { id: b.id, kind: 'defense', x, y, hp: Math.round(210 * (1 + 0.35 * (lvl - 1)) * defBoost), size: 6, damage: Math.round((12 + lvl * 3) * defBoost), range: 24, art };
    return { id: b.id, kind: 'building', x, y, hp: Math.round(150 * (1 + 0.3 * (lvl - 1)) * defBoost), size: 6, art };
  });
  const ws: BattleBuildingDef[] = walls.map((w, i) => ({
    id: `wall-${i}`, kind: 'wall', x: cx(Math.min(90, Math.max(10, w.gridX * 10))), y: cx(Math.min(90, Math.max(10, w.gridY * 10))), hp: Math.round(wallHp * defBoost), size: 4,
  }));
  const ds: BattleBuildingDef[] = defenses.map(d => {
    const t = DEFENSE_TYPES.find(x => x.kind === d.kind) ?? DEFENSE_TYPES[0];
    const lvl = Math.max(1, d.level ?? 1);
    return {
      id: d.id, kind: 'defense' as const, flavor: t.kind as BattleBuildingDef['flavor'],
      x: cx(Math.min(88, Math.max(12, d.gridX * 10))), y: cx(Math.min(88, Math.max(12, d.gridY * 10))),
      hp: Math.round(t.hp * defBoost * (1 + 0.12 * (lvl - 1))), size: 5, damage: Math.round(t.damage * defBoost * (1 + 0.10 * (lvl - 1))), range: t.range,
    };
  });
  // The Team Bus: one BIG wall-tier blocker — parks the south gate shut (pathfinding
  // treats its cell like any wall, but it takes far more smashing).
  const busB: BattleBuildingDef[] = bus ? [{
    id: 'team-bus', kind: 'wall',
    x: cx(Math.min(90, Math.max(10, bus.gridX * 10))), y: cx(Math.min(90, Math.max(10, bus.gridY * 10))),
    hp: Math.round(wallHp * 2.2 * defBoost), size: 6,
  }] : [];
  return [...bs, ...ws, ...ds, ...busB];
};

// YOUR defenders, on the field: the defensive-tendency players you actually recruited
// and trained start the defense battle guarding the stadium (balanced tendencies suit up
// too when there aren't enough true defenders). Stats scale with each player's OVR —
// recruiting and training your defense is now something you can WATCH work.
export interface HomeGuardDef { jersey: number; hp: number; dps: number; name: string; art?: string; unit?: UnitGroup; }
export const homeDefenders = (roster: Player[], parkingLotLevel = 0): HomeGuardDef[] => {
  const side = (p: Player) => {
    const t = TENDENCIES[p.tendency as TendencyKey];
    return t?.side === 'defense' ? 2 : t?.side === 'balanced' ? 1 : 0;
  };
  const jerseyOf = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return 40 + (h % 59); };
  
  const rosterGuards = roster
    .filter(p => side(p) > 0)
    .sort((a, b) => side(b) - side(a) || playerOvr(b) - playerOvr(a))
    .slice(0, 4)
    .map(p => {
      const ovr = playerOvr(p);
      const balanced = side(p) === 1;
      return {
        jersey: jerseyOf(p.id),
        hp: Math.round((110 + ovr * 5.5) * (balanced ? 0.8 : 1)),
        dps: Math.round((7 + ovr * 0.55) * (balanced ? 0.8 : 1) * 10) / 10,
        name: p.name,
        unit: p.unit, // real position group → the guard wears the right sprite
      };
    });

  const fanGuards: HomeGuardDef[] = [];
  const pl = Math.min(PARKING_LOT.maxLevel, Math.max(0, parkingLotLevel));
  if (pl > 0) {
    const mobCount = pl * 3; // L1=3, L2=6, L3=9 swarms
    for (let i = 0; i < mobCount; i++) {
      fanGuards.push({
        jersey: 99,
        hp: 75,
        dps: 12,
        name: 'Tailgate Mob',
        art: '/assets/units/fan-mob.png'
      });
    }
  }

  return [...rosterGuards, ...fanGuards];
};

// The AI raiding party, pre-placed around the perimeter of your base.
export const defenseAiTroops = (): { unit: UnitGroup; x: number; y: number }[] => {
  const spec: [UnitGroup, number][] = [
    [UnitGroup.OFFENSE_LINE, 2],
    [UnitGroup.OFFENSE_SKILL, 3],
    [UnitGroup.DEFENSE_LINE, 2],
    [UnitGroup.DEFENSE_SECONDARY, 2],
  ];
  const total = spec.reduce((s, [, c]) => s + c, 0);
  const out: { unit: UnitGroup; x: number; y: number }[] = [];
  let i = 0;
  for (const [unit, count] of spec) {
    for (let k = 0; k < count; k++) {
      const ang = (i / total) * Math.PI * 2;
      out.push({ unit, x: 50 + Math.cos(ang) * 44, y: 50 + Math.sin(ang) * 44 });
      i++;
    }
  }
  return out;
};

// Attacker strength multiplier for a raid on the player's base. Tuned (see __tune data)
// so a maintained base (wall ring + upgrades) holds, while a neglected base falls.
// Defense HP/damage already scale with building level, so this stays gentle on level.
export const raidAiMult = (offenseRating: number, stadiumLevel: number) =>
  (0.55 + offenseRating / 150) * (1 + 0.03 * (stadiumLevel - 1)); // balance-sim tuned: low tiers concede 1-2⭐, fortified tiers hold

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Nearest alive non-wall building (the real objective; walls are obstacles, not goals).
 *  `pref` discounts distance to the troop's preferred target kind so roles shape targeting
 *  without ever sending a unit across the whole map past closer threats. */
export const nearestBuilding = (x: number, y: number, buildings: BBuilding[], pref?: TargetPref): BBuilding | null => {
  let best: BBuilding | null = null;
  let bd = Infinity;
  for (const b of buildings) {
    if (b.dead || b.kind === 'wall') continue;
    let d = dist(x, y, b.x, b.y);
    if (pref) {
      const isLoot = b.kind === 'building' || b.kind === 'hq';
      if ((pref.kind === 'defense' && b.kind === 'defense') || (pref.kind === 'loot' && isLoot)) d *= pref.w;
    }
    if (d < bd) { bd = d; best = b; }
  }
  return best;
};

/** A wall directly between the troop and its goal, close enough to be blocking. */
export const blockingWall = (tx: number, ty: number, range: number, goal: BBuilding, buildings: BBuilding[]): BBuilding | null => {
  const gd = dist(tx, ty, goal.x, goal.y);
  let best: BBuilding | null = null;
  let bd = Infinity;
  for (const b of buildings) {
    if (b.dead || b.kind !== 'wall') continue;
    const td = dist(tx, ty, b.x, b.y);
    if (td > b.size * 0.5 + range + 6) continue;      // must be close
    if (dist(b.x, b.y, goal.x, goal.y) >= gd) continue; // must be nearer the goal than we are
    if (td < bd) { bd = td; best = b; }
  }
  return best;
};

// --- WALL-AWARE PATHFINDING -------------------------------------------------
// Troops path AROUND walls when a gap exists and only smash through when boxed in
// (wall cells are passable at high cost, the Clash rule). The grid is the SAME
// 10×10 the Design editor uses — so the wall lines you place are exactly the
// barriers the attacker's AI must answer. Walls become a puzzle, not a speed bump.
export interface PathPlan {
  path: { x: number; y: number }[]; // waypoint cell centers, start-exclusive
  targetWallId: string | null;      // first wall on the chosen route (the one to smash)
  goalId: string;
  blocked: Set<string>;             // live-wall cells at plan time (for corner-cutting LOS)
  age: number;
}

const cellOf = (v: number) => Math.max(0, Math.min(9, Math.round(v / 10)));
const WALL_STEP_COST = 7; // a detour up to ~6 extra cells beats stopping to smash

export const planPath = (fromX: number, fromY: number, goal: BBuilding, buildings: BBuilding[]): PathPlan => {
  const wallAt: (BBuilding | null)[] = new Array(100).fill(null);
  const blocked = new Set<string>();
  for (const b of buildings) {
    if (b.kind !== 'wall' || b.dead) continue;
    const i = cellOf(b.x), j = cellOf(b.y);
    wallAt[j * 10 + i] = b;
    blocked.add(`${i},${j}`);
  }
  const start = cellOf(fromY) * 10 + cellOf(fromX);
  const gx = cellOf(goal.x), gy = cellOf(goal.y);
  const end = gy * 10 + gx;
  // A* over 100 cells, 4-connected (no slipping diagonally between wall corners).
  const g = new Array(100).fill(Infinity); g[start] = 0;
  const prev = new Array(100).fill(-1);
  const closed = new Array(100).fill(false);
  const open: number[] = [start];
  const h = (n: number) => Math.abs((n % 10) - gx) + Math.abs(((n / 10) | 0) - gy);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === end) break;
    if (closed[cur]) continue;
    closed[cur] = true;
    const ci = cur % 10, cj = (cur / 10) | 0;
    for (const [ni, nj] of [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]]) {
      if (ni < 0 || ni > 9 || nj < 0 || nj > 9) continue;
      const n = nj * 10 + ni;
      const step = wallAt[n] ? WALL_STEP_COST : 1;
      if (g[cur] + step < g[n]) { g[n] = g[cur] + step; prev[n] = cur; if (!closed[n]) open.push(n); }
    }
  }
  const cells: number[] = [];
  for (let n = end; n !== -1 && n !== start; n = prev[n]) cells.unshift(n);
  let targetWallId: string | null = null;
  for (const n of cells) { if (wallAt[n]) { targetWallId = wallAt[n]!.id; break; } }
  return { path: cells.map(n => ({ x: (n % 10) * 10, y: ((n / 10) | 0) * 10 })), targetWallId, goalId: goal.id, blocked, age: 0 };
};

// --- REPLAYS: deterministic battles. A seeded RNG + a recorded deploy script re-create
// an attack EXACTLY — so when a live rival raids you, you can watch the actual drive.
export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface ReplayAction { tick: number; k: 't' | 'h' | 's' | 'p' | 'a'; u?: UnitGroup; key?: string; x?: number; y?: number; }
export interface ReplayData {
  v: 1;
  seed: number;
  plan: string;                       // GamePlanKey the attacker locked in
  power?: Record<UnitGroup, number>;  // attacker's troop multipliers
  heroes: RaidHero[];                 // attacker's hero kit as fielded
  specials: SpecialDef[];             // mascot / fan-mob kit
  layout: BattleBuildingDef[];        // the DEFENDER's base as it was attacked
  script: ReplayAction[];             // every deploy / play / ability, by tick
}

// Dev-only test hook: lets browser-console tests drive the pathfinder directly.
if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) (window as any).__fhqPlanPath = planPath;

/** True when the straight segment crosses no live-wall cell — lets runners cut corners naturally. */
export const losClear = (x0: number, y0: number, x1: number, y1: number, blocked: Set<string>): boolean => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 3));
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps, y = y0 + ((y1 - y0) * k) / steps;
    if (blocked.has(`${cellOf(x)},${cellOf(y)}`)) return false;
  }
  return true;
};

export const nearestTroop = (x: number, y: number, troops: BTroop[], within: number): BTroop | null => {
  let best: BTroop | null = null;
  let bd = within;
  for (const t of troops) {
    if (t.dead) continue;
    const d = dist(x, y, t.x, t.y);
    if (d <= bd) { bd = d; best = t; }
  }
  return best;
};

// ---------------------------------------------------------------------------
// Headless raid simulation — runs the SAME combat math as the live BattleScreen
// but with no UI, to resolve an offline attack on the player's base. Because it
// uses defenseLayoutFromBase() + blockingWall(), the player's building levels and
// Blocking Sled placement genuinely change the outcome (better base = attacker
// gets fewer stars). Used for the "while you were away" defense log.
// ---------------------------------------------------------------------------
export interface RaidSimResult { stars: number; pct: number; hqDead: boolean; }

export const simulateRaid = (
  defBuildings: BattleBuildingDef[],
  attackers: { unit: UnitGroup; x: number; y: number }[],
  aiMult = 1,
): RaidSimResult => {
  const buildings: BBuilding[] = defBuildings.map(b => ({ ...b, maxHp: b.hp, dead: false, cooldown: 0 }));
  const troops: BTroop[] = attackers.map((t, i) => {
    const st = TROOP_STATS[t.unit];
    const hp = Math.round(st.hp * aiMult);
    return { id: `a${i}`, unit: t.unit, x: t.x, y: t.y, hp, maxHp: hp, dps: st.dps * aiMult, speed: st.speed, range: st.range, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0 };
  });
  const total = buildings.filter(b => b.kind !== 'wall').length || 1;
  const DT = 0.1; // coarse 100ms steps — plenty accurate for a resolved outcome

  for (let t = 0; t < BATTLE_SECONDS; t += DT) {
    for (const tr of troops) {
      if (tr.dead) continue;
      const goal = nearestBuilding(tr.x, tr.y, buildings);
      if (!goal) continue;
      const wall = blockingWall(tr.x, tr.y, tr.range, goal, buildings);
      const target = wall || goal;
      const d = dist(tr.x, tr.y, target.x, target.y);
      const stopAt = tr.range + target.size * 0.5;
      if (d > stopAt) {
        const step = Math.min(tr.speed * DT, d - stopAt);
        tr.x += ((target.x - tr.x) / d) * step;
        tr.y += ((target.y - tr.y) / d) * step;
      } else {
        target.hp -= tr.dps * DT;
        if (target.hp <= 0) { target.hp = 0; target.dead = true; }
      }
    }
    for (const b of buildings) {
      if (b.dead || b.kind !== 'defense' || !b.damage || !b.range) continue;
      b.cooldown -= DT;
      if (b.cooldown <= 0) {
        const prey = nearestTroop(b.x, b.y, troops, b.range);
        if (prey) { prey.hp -= b.damage; if (prey.hp <= 0) { prey.hp = 0; prey.dead = true; } b.cooldown = 0.7; }
        else b.cooldown = 0.1;
      }
    }
    const allDead = buildings.filter(b => b.kind !== 'wall').every(b => b.dead);
    if (allDead || !troops.some(tr => !tr.dead)) break;
  }

  const destroyed = buildings.filter(b => b.dead && b.kind !== 'wall').length;
  const pct = Math.round((destroyed / total) * 100);
  const hqDead = buildings.find(b => b.kind === 'hq')?.dead ?? false;
  const stars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
  return { stars, pct, hqDead };
};
