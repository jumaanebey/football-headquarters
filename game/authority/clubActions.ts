import {progressClubDaily} from '../dailyProgress';
export {progressClubDaily} from '../dailyProgress';
import { BuildingType, DrillState, PlayerRarity, PlayerRole, PlayerState, ResourceType, UnitGroup, type GameState, type Player, type UpgradeJob } from '../../types';
import {
  COLLECTOR_CONFIG, DRILLS, EXTRA_SLOT_COSTS, MAX_BUILDERS, PARKING_LOT, RARITY_CONFIG, RECRUIT_CONFIG, RECRUIT_FIRST_NAMES, RECRUIT_LAST_NAMES,
  ROLE_UNIT, TENDENCY_KEYS, UNIT_COLOR, UPGRADE_CONFIG, builderHireCost, displayAnchorOf, skipGemCost, trainingYieldMult, upgradeDurationSecs, warRoomReadinessMult,
} from '../../constants';
import { HERO_DEFS, heroMaxLevel, heroUpgradeCost } from '../../battle';
import { MAX_STARS, ROLL_COST_GEMS, STAR_UP_COSTS } from '../../gacha';
import { recruitCost, recruitSeconds, rosterCap } from '../../recruiting';
import { SWEEP_BONUS_GEMS, freshDailies, questsForDate } from '../../dailies';
import { FORMATION_ORDER, MAX_SLOT_LEVEL, anchorsFor, formationUnlocked, gatePostsFor, slotById, slotUnlocked, slotUpgradeCost, type FormationKey } from '../../fixedBase';
import { advanceEconomy } from '../economy';
import { fanMilestoneTotal, nextFanMilestone, rallyFans, rallyPreview } from '../fanProgress';
import {applyStadiumFootball,STADIUM_OPPONENTS,footballInProgress,type StadiumAction} from '../stadiumFootball';
import {applyScouting,SCOUTING_TRIPS,RECRUITING_CONTACTS,type ScoutingAction} from '../scouting';
import {STATIONS,startDevelopment,isDevelopmentSteps,type DevelopmentStep} from '../development';
import { advanceCampus } from '../campus';
import { applyCampusLayout, parseCampusLayout, type CampusLayout } from '../campusLayout';

export type ClubAction = StadiumAction | ScoutingAction
  | { type: 'sync' }
  | { type: 'development.start'; unit: UnitGroup|'ALL'; steps: DevelopmentStep[] }
  | { type: 'development.read'; reportId: string }
  | { type: 'development.stop'; scheduleId: string }
  | { type: 'facility.collect'; buildingId: string }
  | { type: 'facility.upgrade'; buildingId: string }
  | { type: 'facility.rush'; jobId: string }
  | { type: 'builder.hire' }
  | { type: 'rally' }
  | { type: 'training.start'; drillId: string; unit: UnitGroup }
  | { type: 'training.collect'; buildingId: string }
  | { type: 'hero.train'; heroKey: string }
  | { type: 'hero.unlock'; heroKey: string }
  | { type: 'hero.star'; heroKey: string }
  | { type: 'hero.scout' }
  | { type: 'recruit.refresh' }
  | { type: 'recruit.start'; candidateId: string }
  | { type: 'recruit.rush' }
  | { type: 'recruit.sign' }
  | { type: 'recruit.cut'; playerId: string }
  | { type: 'daily.claim'; questId: string }
  | { type: 'defense.seen'; ids: string[] }
  | { type: 'defense.buy-slot' }
  | { type: 'defense.upgrade-slot'; slotId: string }
  | { type: 'formation.set'; formation: FormationKey }
  | { type: 'gate.assign'; postId: string; heroKey: string }
  | { type: 'campus.apply'; layout: CampusLayout }
  | { type: 'parking.upgrade' }
  | { type: 'club.rename'; name: string };

export interface ClubActionContext {
  now: number;
  random: () => number;
  calendarDate?: string;
}

export type ClubActionOutcome =
  | { ok: true; state: GameState; result: { type: ClubAction['type']; [key: string]: unknown } }
  | { ok: false; state: GameState; code: string; message: string };

/** The scouting board offered by `recruit.refresh` / `recruit.sign` (stored on `GameState.recruitBoard`). */
export interface RecruitBoard {
  candidates: Player[];
  generatedAt: number;
}

type ClubClock = number | Pick<ClubActionContext, 'now' | 'calendarDate'>;

const fields: Record<ClubAction['type'], string[]> = {
  'sync': [],
  'stadium.start':['opponent'],
  'stadium.call':['gameId','turn','call'],
  'stadium.collect':['gameId'],
  'stadium.abandon':['gameId'],
  'scouting.search':['tier','pace'],
  'scouting.contact':['playerId','contact'],
  'scouting.rush':['playerId','jobId'],
  'scouting.sign':['playerId'],
  'scouting.dismiss':['playerId'],
  'development.start':['unit','steps'],
  'development.read':['reportId'],
  'development.stop':['scheduleId'],
  'facility.collect': ['buildingId'],
  'facility.upgrade': ['buildingId'],
  'facility.rush': ['jobId'],
  'builder.hire': [],
  'rally': [],
  'training.start': ['drillId', 'unit'],
  'training.collect': ['buildingId'],
  'hero.train': ['heroKey'],
  'hero.unlock': ['heroKey'],
  'hero.star': ['heroKey'],
  'hero.scout': [],
  'recruit.refresh': [],
  'recruit.start': ['candidateId'],
  'recruit.rush': [],
  'recruit.sign': [],
  'recruit.cut': ['playerId'],
  'daily.claim': ['questId'],
  'defense.seen': ['ids'],
  'defense.buy-slot': [],
  'defense.upgrade-slot': ['slotId'],
  'formation.set': ['formation'],
  'gate.assign': ['postId', 'heroKey'],
  'campus.apply': ['layout'],
  'parking.upgrade': [],
  'club.rename': ['name'],
};

export function parseClubAction(input: unknown): ClubAction | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.type !== 'string' || !Object.prototype.hasOwnProperty.call(fields, value.type)) return null;
  const required = fields[value.type as ClubAction['type']];
  if (Object.keys(value).length !== required.length + 1 || Object.keys(value).some(key => key !== 'type' && !required.includes(key))) return null;
  if(value.type==='development.start'){
    if((value.unit!=='ALL'&&!Object.values(UnitGroup).includes(value.unit as UnitGroup))||!isDevelopmentSteps(value.steps))return null;
    return {type:'development.start',unit:value.unit as UnitGroup|'ALL',steps:value.steps.map(s=>({...s}))};
  }
  if (value.type === 'campus.apply') {
    const layout = parseCampusLayout(value.layout);
    return layout ? { type: 'campus.apply', layout } : null;
  }
  if (value.type === 'defense.seen') {
    if (!Array.isArray(value.ids) || value.ids.length > 100 || !value.ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 120) || new Set(value.ids).size !== value.ids.length) return null;
    return { type: 'defense.seen', ids: [...value.ids] };
  }
  if (!required.every(key => typeof value[key] === 'string' && (value[key] as string).length > 0 && (value[key] as string).length <= 120)) return null;
  if(value.type==='stadium.start'&&!Object.prototype.hasOwnProperty.call(STADIUM_OPPONENTS,String(value.opponent)))return null;
  if(value.type==='stadium.call'&&!/^(0|[1-9][0-9]?)$/.test(String(value.turn)))return null;
  if(value.type==='scouting.search'&&(!Object.prototype.hasOwnProperty.call(SCOUTING_TRIPS,String(value.tier))||!['time','coins'].includes(String(value.pace))))return null;
  if(value.type==='scouting.contact'&&!Object.prototype.hasOwnProperty.call(RECRUITING_CONTACTS,String(value.contact)))return null;
  if (value.type === 'training.start' && !Object.values(UnitGroup).includes(value.unit as UnitGroup)) return null;
  if (value.type === 'formation.set' && !FORMATION_ORDER.includes(value.formation as FormationKey)) return null;
  if (value.type === 'club.rename' && (String(value.name).trim().length < 2 || String(value.name).trim().length > 24 || /[\u0000-\u001f\u007f-\u009f]/u.test(String(value.name)))) return null;
  return { ...value } as ClubAction;
}

export function settleClubState(previous: GameState, clock: ClubClock): GameState {
  const context = typeof clock === 'number' ? { now: clock } : clock;
  const { now } = context;
  if (!Number.isFinite(now) || now < previous.lastTick) return previous;
  const date = context.calendarDate ?? new Date(now).toISOString().slice(0, 10);
  return {
    ...advanceCampus(previous, now, date),
    lastTick: now,
    peakFans: fanMilestoneTotal(previous),
    dailies: previous.dailies.date === date ? previous.dailies : freshDailies(date),
    gauntlet: previous.gauntlet.date === date ? previous.gauntlet : { ...previous.gauntlet, date, attempts: 3 },
  };
}


function validBalances(state: GameState): boolean {
  return Object.values(ResourceType).every(key => Number.isFinite(state.resources[key]) && state.resources[key] >= 0)
    && state.resources.ENERGY <= 100
    && Number.isFinite(state.lastTick)
    && state.buildings.every(value => Number.isSafeInteger(value.level) && value.level >= 1)
    && state.heroes.every(value => Number.isSafeInteger(value.level) && value.level >= 1 && Number.isSafeInteger(value.stars) && value.stars >= 1 && value.stars <= MAX_STARS && Number.isFinite(value.shards) && value.shards >= 0);
}

function recruitBoard(state: GameState, now: number, random: () => number): RecruitBoard {
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const roles = Object.values(PlayerRole);
  const weights = Object.entries(RECRUIT_CONFIG.rarity) as [PlayerRarity, (typeof RECRUIT_CONFIG.rarity)[PlayerRarity]][];
  const total = weights.reduce((sum, [, value]) => sum + value.weight, 0);
  const used = new Set<string | undefined>([...state.roster.map(value => value.id), ...(state.recruitBoard?.candidates.map(value => value.id) ?? []), state.recruitSlot?.candidate.id]);
  const candidates = Array.from({ length: RECRUIT_CONFIG.candidateCount }, (_, index): Player => {
    const role = pick(roles), unit = ROLE_UNIT[role];
    let cursor = random() * total;
    const rarity = weights.find(([, value]) => (cursor -= value.weight) < 0)?.[0] ?? PlayerRarity.COMMON;
    const tuning = RECRUIT_CONFIG.rarity[rarity];
    const stat = () => Math.max(1, Math.round(tuning.baseStat + (random() * 2 - 1) * tuning.jitter));
    let id = `rec_${now}_${Math.floor(random() * 1e6)}_${index}`;
    while (used.has(id)) id += '_n';
    used.add(id);
    return {
      id,
      name: `${pick(RECRUIT_FIRST_NAMES)} ${pick(RECRUIT_LAST_NAMES)}`,
      role,
      unit,
      rarity,
      level: 1,
      stats: { strength: stat(), speed: stat(), iq: stat() },
      maxStat: RARITY_CONFIG[rarity].maxStat,
      worldPos: { x: 60, y: 12, z: 0 },
      targetPos: { x: 60, y: 12, z: 0 },
      state: PlayerState.IDLE,
      avatarColor: UNIT_COLOR[unit],
      tendency: pick(TENDENCY_KEYS),
    };
  });
  return { candidates, generatedAt: now };
}

export function applyClubAction(previous: GameState, input: unknown, context: ClubActionContext): ClubActionOutcome {
  const fail = (code: string, message: string): ClubActionOutcome => ({ ok: false, state: previous, code, message });
  const command = parseClubAction(input);
  if (!command) return fail('invalid_command', 'Choose a valid club action.');
  if (!Number.isSafeInteger(context.now) || context.now < 0 || context.now > 864e13 || context.now < previous.lastTick || (context.calendarDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(context.calendarDate))) return fail('invalid_clock', 'Club time could not be verified.');
  if (!validBalances(previous)) return fail('invalid_state', 'Club progress could not be verified.');
  const state = settleClubState(previous, context);
  const now = context.now;
  const random = () => {
    const value = context.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Authority random source must return a finite value in [0, 1).');
    return value;
  };
  const success = (next: GameState, receipt: Record<string, unknown> = {}): ClubActionOutcome =>
    validBalances(next) ? { ok: true, state: next, result: { type: command.type, ...receipt } } : fail('invalid_state', 'This action would produce invalid club progress.');
  const spend = (resource: ResourceType, cost: number) => Number.isSafeInteger(cost) && cost >= 0 && state.resources[resource] >= cost;
  const stadiumLevel = state.buildings.find(value => value.type === BuildingType.STADIUM)?.level ?? 1;
  const makeJob = (kind: UpgradeJob['kind'], key: string, toLevel: number, duration: number): UpgradeJob => {
    let id = `${kind === 'hero' ? 'hj' : 'up'}_${now}_${key}_${Math.floor(random() * 1e6)}`;
    while (state.upgrades.some(value => value.id === id)) id += '_n';
    return { id, kind, key, toLevel, startTime: now, finishTime: now + duration * 1e3 };
  };
  if(footballInProgress(state)&&!['sync','stadium.call','stadium.abandon'].includes(command.type))return fail('active_match','Finish your Stadium game before changing the team.');
  switch (command.type) {
    case 'stadium.start':case 'stadium.call':case 'stadium.collect':case 'stadium.abandon':{const next=applyStadiumFootball(state,command,now,random);return typeof next==='string'?fail('not_ready',next):success(next);}
    case 'scouting.search': case 'scouting.contact': case 'scouting.rush': case 'scouting.sign': case 'scouting.dismiss': {
      const next=applyScouting(state,command,now,random);return typeof next==='string'?fail('not_ready',next):success(next);
    }
    case 'development.start': {
      const next=startDevelopment(state,command.unit,command.steps,now);
      return typeof next==='string'?fail('not_ready',next):success(next,{scheduleId:next.development!.schedule!.id});
    }
    case 'development.stop': {
      const schedule=state.development?.schedule;if(!schedule||schedule.id!==command.scheduleId)return fail('not_found','This schedule is already finished.');
      const refund=Math.min(100-state.resources.ENERGY,schedule.blocks.slice(schedule.completed+1).reduce((n,b)=>n+STATIONS[b.station].energy,0));
      return success({...state,resources:{...state.resources,ENERGY:state.resources.ENERGY+refund},development:{...state.development!,schedule:null}},{gained:{ENERGY:refund}});
    }
    case 'development.read': {
      if(!state.development?.reports.some(r=>r.id===command.reportId))return fail('not_found','That session report was not found.');
      return success({...state,development:{...state.development,reports:state.development.reports.map(r=>r.id===command.reportId?{...r,read:true}:r)}});
    }
    case 'sync':
      return success(state);
    case 'defense.seen': {
      const ids = new Set(command.ids);
      return success({ ...state, defenseLog: state.defenseLog.map(entry => (ids.has(entry.id) && !entry.seen ? { ...entry, seen: true } : entry)) });
    }
    case 'club.rename':
      return success({ ...state, teamName: command.name.trim().replace(/\s+/g, ' ') });
    case 'facility.collect': {
      const building = state.buildings.find(value => value.id === command.buildingId);
      const collector = building && COLLECTOR_CONFIG[building.type];
      if (!building || !collector) return fail('not_found', 'That facility does not collect resources.');
      const amount = Math.floor(building.accrued ?? 0);
      if (amount <= 0) return fail('not_ready', 'There are no resources to collect yet.');
      const next: GameState = {
        ...state,
        resources: { ...state.resources, [collector.resource]: state.resources[collector.resource] + amount },
        peakFans: nextFanMilestone(state, collector.resource === ResourceType.FANS ? amount : 0),
        buildings: state.buildings.map(value => (value.id === building.id ? { ...value, accrued: 0 } : value)),
      };
      return success(collector.resource === ResourceType.COINS ? progressClubDaily(next, 'bank_coins', amount) : next, { buildingId: building.id, gained: { [collector.resource]: amount } });
    }
    case 'facility.upgrade': {
      const building = state.buildings.find(value => value.id === command.buildingId);
      if (!building) return fail('not_found', 'That facility was not found.');
      if (state.upgrades.some(value => value.kind === 'building' && value.key === building.id) || state.upgrades.length >= state.builders) return fail('busy', 'Wait for a builder to finish.');
      if (building.type !== BuildingType.STADIUM && building.level >= stadiumLevel) return fail('locked', 'Upgrade the Stadium first.');
      const cost = Math.floor(UPGRADE_CONFIG.baseCost * UPGRADE_CONFIG.costMultiplier ** (building.level - 1));
      if (!spend(ResourceType.COINS, cost)) return fail('insufficient_resources', 'Not enough coins.');
      const job = makeJob('building', building.id, building.level + 1, upgradeDurationSecs(building.level + 1));
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, upgrades: [...state.upgrades, job] }, { buildingId: building.id, jobId: job.id, toLevel: job.toLevel, spent: { COINS: cost } });
    }
    case 'facility.rush': {
      const job = state.upgrades.find(value => value.id === command.jobId);
      if (!job) return fail('not_found', 'That upgrade is already complete or unavailable.');
      const cost = skipGemCost((job.finishTime - now) / 1e3);
      if (!spend(ResourceType.GEMS, cost)) return fail('insufficient_resources', 'Not enough Crowns.');
      const purchased: GameState = { ...state, resources: { ...state.resources, GEMS: state.resources.GEMS - cost }, upgrades: state.upgrades.map(value => (value.id === job.id ? { ...value, finishTime: now } : value)) };
      return success({ ...purchased, ...advanceEconomy(purchased, now) }, { jobId: job.id, toLevel: job.toLevel, spent: { GEMS: cost } });
    }
    case 'builder.hire': {
      if (state.builders >= MAX_BUILDERS) return fail('limit_reached', 'All builders are already hired.');
      const cost = builderHireCost(state.builders);
      if (!spend(ResourceType.GEMS, cost)) return fail('insufficient_resources', 'Not enough Crowns.');
      return success({ ...state, builders: state.builders + 1, resources: { ...state.resources, GEMS: state.resources.GEMS - cost } }, { spent: { GEMS: cost } });
    }
    case 'rally': {
      const preview = rallyPreview(state);
      if (!preview.canRally) return fail(state.resources.ENERGY >= 100 ? 'limit_reached' : 'insufficient_resources', state.resources.ENERGY >= 100 ? 'Energy is already full.' : 'Not enough Fans.');
      return success(rallyFans(state), { spent: { FANS: preview.fanCost }, gained: { ENERGY: preview.energyGain } });
    }
    case 'training.start': {
      if(state.development?.schedule)return fail('busy','Finish your team schedule before starting another workout.');
      const drill = Object.prototype.hasOwnProperty.call(DRILLS, command.drillId) ? DRILLS[command.drillId] : undefined;
      if (!drill || (drill.targetUnit !== 'ALL' && drill.targetUnit !== command.unit)) return fail('invalid_command', 'That drill does not train this unit.');
      const pitch = state.buildings.find(value => value.type === BuildingType.TRAINING_PITCH && value.state === DrillState.IDLE);
      if (!pitch) return fail('busy', 'The Training Field is busy.');
      if (pitch.level < drill.levelReq) return fail('locked', 'Upgrade the Training Field for this drill.');
      if (!state.roster.some(value => drill.targetUnit === 'ALL' || value.unit === command.unit)) return fail('not_found', 'No players in this training unit.');
      if (!spend(ResourceType.ENERGY, drill.costEnergy)) return fail('insufficient_resources', 'Not enough Energy.');
      const anchor = state.campusLayout ? pitch : displayAnchorOf(pitch);
      return success({
        ...state,
        resources: { ...state.resources, ENERGY: state.resources.ENERGY - drill.costEnergy },
        buildings: state.buildings.map(value => (value.id === pitch.id ? { ...value, state: DrillState.ACTIVE, activeDrillId: drill.id, targetUnit: command.unit, startTime: now, finishTime: now + drill.durationSeconds * 1e3 } : value)),
        roster: state.roster.map(value => (drill.targetUnit === 'ALL' || value.unit === command.unit ? { ...value, state: PlayerState.WALKING, targetPos: { x: anchor.gridX * 10 + 10 + random() * 6 - 3, y: anchor.gridY * 10 + 10 + random() * 6 - 3, z: 1 } } : value)),
      }, { buildingId: pitch.id, spent: { ENERGY: drill.costEnergy } });
    }
    case 'training.collect': {
      const pitch = state.buildings.find(value => value.id === command.buildingId && value.type === BuildingType.TRAINING_PITCH);
      if (!pitch) return fail('not_found', 'The Training Field was not found.');
      const drill = pitch.activeDrillId && Object.prototype.hasOwnProperty.call(DRILLS, pitch.activeDrillId) ? DRILLS[pitch.activeDrillId] : undefined;
      if (!drill || pitch.state !== DrillState.COMPLETED || pitch.finishTime === null || pitch.finishTime > now) return fail('not_ready', 'The drill is not ready to collect.');
      const coins = Math.round(drill.rewardCoins * trainingYieldMult(pitch.level));
      const warRoomLevel = state.buildings.find(value => value.type === BuildingType.TACTICS_ROOM)?.level ?? 1;
      const next: GameState = {
        ...state,
        resources: { ...state.resources, COINS: state.resources.COINS + coins },
        teamReadiness: Math.min(100, state.teamReadiness + drill.readinessGain * warRoomReadinessMult(warRoomLevel)),
        roster: state.roster.map(value => (drill.targetUnit === 'ALL' || value.unit === pitch.targetUnit ? {
          ...value,
          level: value.level + 1,
          stats: { strength: value.stats.strength + 1, speed: value.stats.speed + 1, iq: value.stats.iq + 1 },
          state: PlayerState.IDLE,
          targetPos: { ...value.worldPos, z: 0 },
        } : value)),
        buildings: state.buildings.map(value => (value.id === pitch.id ? { ...value, state: DrillState.IDLE, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null } : value)),
      };
      return success(progressClubDaily(next, 'drills'), { buildingId: pitch.id, gained: { COINS: coins } });
    }
    case 'hero.train': {
      const hero = state.heroes.find(value => value.key === command.heroKey);
      if (!hero?.unlocked || !HERO_DEFS.some(value => value.key === hero.key)) return fail('locked', 'Unlock this hero first.');
      if (state.upgrades.some(value => value.kind === 'hero' && value.key === hero.key)) return fail('busy', 'This hero is already training.');
      if (hero.level >= heroMaxLevel(stadiumLevel)) return fail('locked', 'Upgrade the Stadium to train this hero further.');
      const cost = heroUpgradeCost(hero.level);
      if (!spend(ResourceType.COINS, cost)) return fail('insufficient_resources', 'Not enough coins.');
      const job = makeJob('hero', hero.key, hero.level + 1, Math.round(upgradeDurationSecs(hero.level + 1) * 3));
      return success(progressClubDaily({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, upgrades: [...state.upgrades, job] }, 'train_hero'), { heroKey: hero.key, jobId: job.id, toLevel: job.toLevel, spent: { COINS: cost } });
    }
    case 'hero.unlock': {
      const def = HERO_DEFS.find(value => value.key === command.heroKey);
      const hero = state.heroes.find(value => value.key === command.heroKey);
      if (!def?.unlock || !hero) return fail('not_found', 'That hero cannot be unlocked here.');
      if (hero.unlocked) return fail('already_claimed', 'This hero is already yours.');
      const coins = def.unlock.coins ?? 0, gems = def.unlock.gems ?? 0;
      if (!spend(ResourceType.COINS, coins) || !spend(ResourceType.GEMS, gems)) return fail('insufficient_resources', 'Not enough coins or Crowns.');
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - coins, GEMS: state.resources.GEMS - gems }, heroes: state.heroes.map(value => (value.key === hero.key ? { ...value, unlocked: true } : value)) }, { heroKey: hero.key, spent: { COINS: coins, GEMS: gems } });
    }
    case 'hero.star': {
      const hero = state.heroes.find(value => value.key === command.heroKey);
      if (!hero?.unlocked) return fail('locked', 'Unlock this hero first.');
      if (hero.stars >= MAX_STARS) return fail('limit_reached', 'This hero has reached maximum stars.');
      const cost = STAR_UP_COSTS[hero.stars];
      if (!cost || hero.shards < cost) return fail('insufficient_resources', 'Not enough hero shards.');
      return success({ ...state, heroes: state.heroes.map(value => (value.key === hero.key ? { ...value, stars: value.stars + 1, shards: value.shards - cost } : value)) }, { heroKey: hero.key, toLevel: hero.stars + 1 });
    }
    case 'hero.scout': {
      if (!spend(ResourceType.GEMS, ROLL_COST_GEMS)) return fail('insufficient_resources', 'Not enough Crowns.');
      const weights = HERO_DEFS.map(value => (value.starter ? 20 : value.unlock?.gems ? 3 : 10));
      let cursor = random() * weights.reduce((sum, value) => sum + value, 0);
      const index = weights.findIndex(weight => (cursor -= weight) < 0);
      const def = HERO_DEFS[index < 0 ? HERO_DEFS.length - 1 : index];
      const hero = state.heroes.find(value => value.key === def.key);
      if (!hero) return fail('invalid_state', 'The hero roster could not be verified.');
      const roll = { key: hero.key, name: def.name, isNew: !hero.unlocked, shards: hero.unlocked ? 14 + Math.floor(random() * 9) : 0 };
      return success(progressClubDaily({ ...state, resources: { ...state.resources, GEMS: state.resources.GEMS - ROLL_COST_GEMS }, heroes: state.heroes.map(value => (value.key === hero.key ? { ...value, unlocked: true, shards: value.shards + roll.shards } : value)) }, 'scout'), { heroKey: hero.key, roll, spent: { GEMS: ROLL_COST_GEMS } });
    }
    case 'recruit.refresh': {
      if (state.recruitSlot) return fail('busy', 'Finish scouting your current player first.');
      return success({ ...state, recruitBoard: recruitBoard(state, now, random) });
    }
    case 'recruit.start': {
      if (state.recruitSlot) return fail('busy', 'A player is already being scouted.');
      const academy = state.buildings.find(value => value.type === BuildingType.YOUTH_ACADEMY);
      if (!academy) return fail('not_found', 'The Scouting Dept was not found.');
      if (state.roster.length >= rosterCap(academy.level)) return fail('limit_reached', 'Your roster is full.');
      const candidate = state.recruitBoard?.candidates.find(value => value.id === command.candidateId);
      if (!candidate || state.roster.some(value => value.id === candidate.id)) return fail('not_found', 'Refresh the board and choose an available prospect.');
      const cost = recruitCost(candidate);
      if (!spend(ResourceType.COINS, cost)) return fail('insufficient_resources', 'Not enough coins.');
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, recruitSlot: { candidate: structuredClone(candidate), cost, finishTime: now + recruitSeconds(candidate) * 1e3 }, recruitBoard: { ...state.recruitBoard!, candidates: state.recruitBoard!.candidates.filter(value => value.id !== candidate.id) } }, { playerId: candidate.id, spent: { COINS: cost } });
    }
    case 'recruit.rush': {
      if (!state.recruitSlot) return fail('not_found', 'No player is being scouted.');
      if (state.recruitSlot.finishTime <= now) return fail('not_ready', 'This player is already ready to sign.');
      const cost = RECRUIT_CONFIG.rushGemCost;
      if (!spend(ResourceType.GEMS, cost)) return fail('insufficient_resources', 'Not enough Crowns.');
      return success({ ...state, resources: { ...state.resources, GEMS: state.resources.GEMS - cost }, recruitSlot: { ...state.recruitSlot, finishTime: now } }, { playerId: state.recruitSlot.candidate.id, spent: { GEMS: cost } });
    }
    case 'recruit.sign': {
      const slot = state.recruitSlot;
      if (!slot || slot.finishTime > now) return fail('not_ready', 'The prospect is not ready to sign.');
      const academy = state.buildings.find(value => value.type === BuildingType.YOUTH_ACADEMY);
      if (!academy || state.roster.length >= rosterCap(academy.level)) return fail('limit_reached', 'Your roster is full.');
      if (state.roster.some(value => value.id === slot.candidate.id)) return fail('already_claimed', 'This player is already signed.');
      const spawn = { x: 56 + random() * 10, y: 8 + random() * 10, z: 0 };
      const next: GameState = { ...state, recruitSlot: null, roster: [...state.roster, { ...slot.candidate, worldPos: spawn, targetPos: { ...spawn }, state: PlayerState.IDLE }] };
      return success({ ...next, recruitBoard: recruitBoard(next, now, random) }, { playerId: slot.candidate.id });
    }
    case 'recruit.cut': {
      if(state.development?.schedule?.playerIds.includes(command.playerId))return fail('busy','This player is following your team schedule. Finish it before releasing them.');
      if (state.roster.length <= 6) return fail('limit_reached', 'Keep at least six players on your roster.');
      if (!state.roster.some(value => value.id === command.playerId)) return fail('not_found', 'That player was not found.');
      return success({ ...state, roster: state.roster.filter(value => value.id !== command.playerId) }, { playerId: command.playerId });
    }
    case 'daily.claim': {
      const slate = questsForDate(state.dailies.date), quest = slate.find(value => value.id === command.questId);
      if (!quest) return fail('not_found', 'That quest is not on today’s slate.');
      if (state.dailies.claimed.includes(quest.id)) return fail('already_claimed', 'This daily reward was already claimed.');
      if ((state.dailies.progress[quest.id] ?? 0) < quest.target) return fail('not_ready', 'Finish the daily objective first.');
      const claimed = [...state.dailies.claimed, quest.id];
      const sweep = !state.dailies.sweepClaimed && slate.every(value => claimed.includes(value.id));
      const gems = (quest.reward.gems ?? 0) + (sweep ? SWEEP_BONUS_GEMS : 0), coins = quest.reward.coins ?? 0;
      return success({ ...state, resources: { ...state.resources, GEMS: state.resources.GEMS + gems, COINS: state.resources.COINS + coins }, dailies: { ...state.dailies, claimed, sweepClaimed: state.dailies.sweepClaimed || sweep } }, { gained: { GEMS: gems, COINS: coins } });
    }
    case 'defense.buy-slot': {
      if (state.bonusDefSlots >= EXTRA_SLOT_COSTS.length) return fail('limit_reached', 'All extra equipment slots are unlocked.');
      const cost = EXTRA_SLOT_COSTS[state.bonusDefSlots];
      if (!spend(ResourceType.GEMS, cost)) return fail('insufficient_resources', 'Not enough Crowns.');
      return success({ ...state, bonusDefSlots: state.bonusDefSlots + 1, resources: { ...state.resources, GEMS: state.resources.GEMS - cost } }, { spent: { GEMS: cost } });
    }
    case 'defense.upgrade-slot': {
      const slot = slotById(state.formation, command.slotId);
      if (!slot) return fail('not_found', 'That equipment slot was not found.');
      const toLevel = (state.defenseSlots[slot.id] ?? 0) + 1;
      if (toLevel > MAX_SLOT_LEVEL) return fail('limit_reached', 'This equipment is at maximum level.');
      if (!slotUnlocked(slot, stadiumLevel, state.bonusDefSlots) || toLevel > stadiumLevel) return fail('locked', 'Unlock this slot or upgrade the Stadium first.');
      const cost = slotUpgradeCost(slot.kind, toLevel);
      if (!spend(ResourceType.COINS, cost)) return fail('insufficient_resources', 'Not enough coins.');
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, defenseSlots: { ...state.defenseSlots, [slot.id]: toLevel } }, { toLevel, spent: { COINS: cost } });
    }
    case 'formation.set': {
      if (!formationUnlocked(command.formation, stadiumLevel)) return fail('locked', 'That formation is not available.');
      const anchors = anchorsFor(command.formation);
      return success({ ...state, formation: command.formation, campusLayout: undefined, buildings: state.buildings.map(value => ({ ...value, ...anchors[value.type] })) });
    }
    case 'campus.apply': {
      const layout = parseCampusLayout(command.layout, state.buildings);
      if (!layout) return fail('invalid_command', 'Keep every owned facility and a valid route through the campus.');
      // A custom layout is also a formation choice: it must clear the same gate as formation.set.
      if (!formationUnlocked(layout.formation, stadiumLevel)) return fail('locked', 'That formation is not available.');
      return success(applyCampusLayout(state, layout));
    }
    case 'gate.assign': {
      if (!gatePostsFor(state.formation).some(value => value.id === command.postId)) return fail('not_found', 'That gate was not found.');
      if (!state.heroes.some(value => value.key === command.heroKey && value.unlocked)) return fail('locked', 'Unlock this hero first.');
      const gates = Object.fromEntries(Object.entries(state.heroGates).filter(([, hero]) => hero !== command.heroKey));
      gates[command.postId] = command.heroKey;
      return success({ ...state, heroGates: gates }, { heroKey: command.heroKey });
    }
    case 'parking.upgrade': {
      if (state.parkingLot >= PARKING_LOT.maxLevel) return fail('limit_reached', 'The Parking Lot is fully paved.');
      const cost = PARKING_LOT.costs[state.parkingLot];
      if (!spend(ResourceType.COINS, cost)) return fail('insufficient_resources', 'Not enough coins.');
      return success({ ...state, resources: { ...state.resources, COINS: state.resources.COINS - cost }, parkingLot: state.parkingLot + 1 }, { toLevel: state.parkingLot + 1, spent: { COINS: cost } });
    }
  }
}
