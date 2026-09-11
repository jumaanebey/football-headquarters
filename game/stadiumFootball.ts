// Stadium football: two possessions, one each, ties allowed.
//
// Both teams run the same readable sequence — field position, an offensive choice against a shown
// defensive context, a scoring decision, and a conversion when it can still change the result —
// and the player makes a call at every step, on whichever side of the ball they are on.
//
// Three rules shape everything here:
//   * Every call has to matter. A choice whose outcome distribution does not depend on the call
//     is not a decision, so the context a player is shown (return coverage, the defensive look)
//     is real and each option answers it differently.
//   * The players who were selected decide the outcome. Matchups read the lineup snapshot the
//     game captured at kickoff, so a later roster change cannot alter a pending game and the
//     result can name who did it.
//   * Events carry geometry, not adjectives. Possession, direction, the yard line the ball
//     started and ended on, and what happened are persisted, so presentation renders the drive
//     rather than inferring it from animation coordinates.
//
// Games saved before this rewrite keep their own rules: see game/stadiumFootballLegacy.ts.
import {progressClubDaily} from './dailyProgress';
import {type GameState, type PlayerRole} from '../types';
import {FOOTBALL_PLAYS,type FootballPlay} from './development';
import {lineupOf,lineupRatings,lineupSnapshot,snapshotSlotPlayer,validLineupSnapshot,type LineupSlotId,type LineupSnapshot} from './lineup';
import {applyLegacyStadiumCall,legacyCollectReward,legacyFootballCalls} from './stadiumFootballLegacy';

export const STADIUM_OPPONENTS={
 harbor:{name:'Harbor Hawks',power:55,style:'zone',reward:100},
 ironwood:{name:'Ironwood Bears',power:85,style:'stack',reward:150},
 summit:{name:'Summit Stars',power:120,style:'man',reward:220},
} as const;
export type StadiumOpponent=keyof typeof STADIUM_OPPONENTS;
export type StadiumPhase='return'|'offense'|'finish'|'conversion'|'kickoff'|'defense'|'defend-finish'|'final';
export const STADIUM_RULES_VERSION=2;

export type Possession='home'|'away';
/** What the coverage team is protecting on the kick return; shown before the lane is chosen. */
export type ReturnCoverage='edges'|'middle'|'balanced';
/** What the defense is showing before the offensive call. */
export type DefensiveLook='blitz'|'deep'|'balanced';
export type FootballActionKind='return'|'kick'|'pass'|'run'|'field-goal'|'conversion'|'stop'|'touchdown'|'concede';

export interface FootballRating {attack:number;defense:number;speed:number;power:number;iq:number;readiness:number;mastery:Partial<Record<FootballPlay,number>>;}
/** Who answered for a play, and with what. Rendered as attribution under the result. */
export interface FootballActor {slot:LineupSlotId;name:string;role:PlayerRole;attribute:'speed'|'power'|'iq'|'overall';value:number}
export interface FootballEvent {
 turn:number;phase:StadiumPhase;call:string;title:string;detail:string;home:number;away:number;play?:FootballPlay;yards:number;
 /** v2 geometry. Absent on events written by the legacy resolver. */
 possession?:Possession;
 /** +1 drives towards the away endzone at yard 100, -1 towards the home endzone at yard 0. */
 direction?:1|-1;
 startYard?:number;endYard?:number;action?:FootballActionKind;scored?:number;actors?:FootballActor[];
}
export interface StadiumFootballGame {
 id:string;opponent:StadiumOpponent;phase:StadiumPhase;turn:number;startedAt:number;home:number;away:number;yardLine:number;
 ratings:FootballRating;events:FootballEvent[];collected:boolean;reward:number;
 /** Present from the two-possession rewrite onwards. Absent means the frozen legacy rules. */
 v?:number;
 /** Which team has the ball right now, and whether this is the first or second possession. */
 possession?:Possession;possessionIndex?:number;
 /** Persisted coin toss, so the receiving order is stable across a reload. */
 receivesFirst?:Possession;
 /** Stable per-game seed. Shown context (coverage, defensive look) derives from it, so reloading
  *  a pending decision shows the same situation it showed before. */
 seed?:number;
 /** The selected team at kickoff. Later roster changes cannot reach a game in progress. */
 lineup?:LineupSnapshot;
}
export interface StadiumFootballState {game:StadiumFootballGame|null;history:{id:string;opponent:StadiumOpponent;home:number;away:number;reward:number;at:number}[];}
export type StadiumAction={type:'stadium.start';opponent:StadiumOpponent}|{type:'stadium.call';gameId:string;turn:string;call:string}|{type:'stadium.collect';gameId:string}|{type:'stadium.abandon';gameId:string};
export const FOOTBALL_ENTRY_ENERGY=10;
export const footballInProgress=(club:GameState)=>!!club.stadiumFootball?.game&&club.stadiumFootball.game.phase!=='final';
export const isTwoPossessionGame=(game:StadiumFootballGame|null|undefined):boolean=>!!game&&game.v===STADIUM_RULES_VERSION;

/** Ratings of the SELECTED team (game/lineup.ts). A reserve cannot change them. */
export function footballRatings(club:GameState):FootballRating{
 const r=lineupRatings(club.roster,lineupOf(club));
 return {attack:r.attack,defense:r.defense,speed:r.speed,power:r.power,iq:r.iq,readiness:club.teamReadiness,mastery:{...club.development?.mastery}};
}

const bounded=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
/** Deterministic 0..1 from the game seed and a label, so shown context survives a reload. */
function seeded(seed:number,label:string):number{
 let h=(seed>>>0)^0x9e3779b9;
 for(let i=0;i<label.length;i++){h=Math.imul(h^label.charCodeAt(i),0x01000193)>>>0;}
 return ((h>>>8)&0xffffff)/0x1000000;
}
const ENDZONE={home:0,away:100} as const;
export const driveDirection=(possession:Possession):1|-1=>possession==='home'?1:-1;
/** Yards from the ball to the endzone the possessing team is attacking. */
export const yardsToGoal=(possession:Possession,yardLine:number):number=>possession==='home'?100-yardLine:yardLine;
export const fieldGoalDistance=(possession:Possession,yardLine:number):number=>Math.max(18,Math.round(yardsToGoal(possession,yardLine)+17));
const advance=(possession:Possession,yardLine:number,yards:number):number=>bounded(yardLine+driveDirection(possession)*yards,0,100);

export const returnCoverageOf=(game:StadiumFootballGame):ReturnCoverage=>{
 const roll=seeded(game.seed??0,`coverage:${game.possessionIndex??0}`);
 return roll<.34?'edges':roll<.67?'middle':'balanced';
};
export const defensiveLookOf=(game:StadiumFootballGame):DefensiveLook=>{
 const roll=seeded(game.seed??0,`look:${game.possessionIndex??0}`);
 return roll<.34?'blitz':roll<.67?'deep':'balanced';
};
const COVERAGE_TEXT:Record<ReturnCoverage,string>={edges:'Their coverage is squeezing both sidelines.',middle:'Their coverage has stacked the middle of the field.',balanced:'Their coverage is spread evenly across the field.'};
const LOOK_TEXT:Record<DefensiveLook,string>={blitz:'They are crowding the line of scrimmage.',deep:'They have dropped their safeties deep.',balanced:'They are showing a balanced front.'};
export const coverageDescription=(coverage:ReturnCoverage)=>COVERAGE_TEXT[coverage];
export const lookDescription=(look:DefensiveLook)=>LOOK_TEXT[look];

/** Return lanes answer the coverage: into the soft side goes further, into the strength is short. */
const LANE_SIDE:Record<string,'edge'|'middle'>={left:'edge',right:'edge',middle:'middle'};
function laneQuality(coverage:ReturnCoverage,call:string):{bonus:number;breakaway:number;note:string}{
 const side=LANE_SIDE[call]??'middle';
 if(coverage==='balanced')return {bonus:side==='middle'?2:0,breakaway:.04,note:'Even coverage: the lanes were the same width.'};
 const soft=coverage==='edges'?'middle':'edge';
 return side===soft
  ?{bonus:14,breakaway:.16,note:`You attacked the open ${soft==='middle'?'middle':'sideline'}.`}
  :{bonus:-6,breakaway:.01,note:`You ran into their ${coverage==='edges'?'sideline':'interior'} strength.`};
}
/** Offensive plays answer the shown look. */
const PLAY_ANSWER:Record<FootballPlay,DefensiveLook>={slants:'blitz',verticals:'deep',flood:'balanced',power:'deep'};
const PLAY_RISK:Record<FootballPlay,number>={slants:.08,verticals:.3,flood:.14,power:.1};

const SLOT_FOR_PLAY:Record<FootballPlay,LineupSlotId>={slants:'QB',flood:'RECEIVER',verticals:'RECEIVER',power:'BACK'};
const ATTRIBUTE_FOR_PLAY:Record<FootballPlay,'speed'|'power'|'iq'>={slants:'iq',flood:'iq',verticals:'speed',power:'power'};
function actorFor(game:StadiumFootballGame,slot:LineupSlotId,attribute:FootballActor['attribute'],ratings:FootballRating):FootballActor|null{
 const player=snapshotSlotPlayer(game.lineup,slot);
 if(!player)return null;
 const value=attribute==='overall'?player.power:Math.round(attribute==='speed'?ratings.speed:attribute==='power'?ratings.power:ratings.iq);
 return {slot,name:player.name,role:player.role,attribute,value};
}
/** The kick is taken by the selected player with the steadiest hands, never a whole-roster average. */
export function kickerOf(game:StadiumFootballGame):LineupSnapshot['players'][number]|null{
 const order:LineupSlotId[]=['BACK','RECEIVER','QB','SAFETY','COVER'];
 for(const slot of order){const player=snapshotSlotPlayer(game.lineup,slot);if(player)return player;}
 return game.lineup?.players[0]??null;
}

/** Would the conversion still change who wins, ties or loses? */
export function conversionMatters(game:StadiumFootballGame):boolean{
 if((game.possessionIndex??0)===0)return true;
 const scoring=game.possession==='home'?'home':'away';
 const outcome=(extra:number)=>{
  const home=game.home+(scoring==='home'?extra:0),away=game.away+(scoring==='away'?extra:0);
  return home>away?'win':home===away?'tie':'loss';
 };
 return new Set([0,1,2].map(outcome)).size>1;
}

/** One line telling the player what this decision is worth. Derived from the score, never generic. */
export function stadiumObjective(game:StadiumFootballGame):string{
 if(game.phase==='final'){
  return game.home>game.away?`Final: you win ${game.home}–${game.away}.`:game.home===game.away?`Final: ${game.home}–${game.away}. A tie.`:`Final: you lose ${game.home}–${game.away}.`;
 }
 const last=(game.possessionIndex??0)===1;
 const mine=game.possession==='home';
 const margin=game.home-game.away;
 if(!last)return mine?'Your possession. Every point here sets the target they have to answer.':'Their possession. Hold them and the game is yours to finish.';
 if(mine){
  if(margin<-7)return `You trail by ${-margin}. Only a touchdown and a two-point conversion can save this.`;
  if(margin<0){const need=-margin;return need===3?'A field goal ties; a touchdown wins.':need<3?`A field goal wins it; you need ${need}.`:`You trail by ${need}. A touchdown and the conversion decide it.`;}
  if(margin===0)return 'Level. A field goal or a touchdown wins it outright.';
  return `You lead by ${margin}. Add points and this is finished.`;
 }
 if(margin>7)return `You lead by ${margin}. Even a touchdown and two points leave them short.`;
 if(margin>0)return margin<=3?`You lead by ${margin}. A field goal ties them; a touchdown beats you.`:`You lead by ${margin}. Keep them out of the endzone.`;
 if(margin===0)return 'Level. Stop them and this ends tied; a score ends it their way.';
 return `You trail by ${-margin}. A stop keeps the margin where it is.`;
}

export function footballCalls(game:StadiumFootballGame):{key:string;name:string;detail:string}[]{
 if(!isTwoPossessionGame(game))return legacyFootballCalls(game);
 const mine=game.possession==='home';
 switch(game.phase){
 case 'return':{
  if(!mine)return [
   {key:'deep',name:'Kick deep',detail:'Make them start further back; a returner with speed can still break it.'},
   {key:'squib',name:'Squib kick',detail:'Gives up field position to take the long return away.'}];
  const coverage=returnCoverageOf(game);
  const lane=(key:string,name:string)=>{const q=laneQuality(coverage,key);return {key,name,detail:q.bonus>4?'Open: their coverage is elsewhere.':q.bonus<0?'Contested: this is where their coverage is.':'Even: no particular advantage.'};};
  return [lane('left','Return left'),lane('middle','Return up the middle'),lane('right','Return right')];
 }
 case 'offense':{
  if(!mine)return [
   {key:'zone',name:'Zone · protect the deep ball',detail:'Takes away four verticals; leaves the short routes open.'},
   {key:'man',name:'Man · take away the quick game',detail:'Takes away slants; vulnerable to deep speed.'},
   {key:'stack',name:'Stack the box',detail:'Stops the power run; opens the passing lanes.'}];
  const look=defensiveLookOf(game);
  const answer=(play:FootballPlay,name:string)=>({key:play,name,detail:`${PLAY_ANSWER[play]===look?'Answers their look.':'Their look is set up against this.'} ${Math.round(PLAY_RISK[play]*100)}% chance of a failed play.`});
  return [answer('slants','Quick slants'),answer('flood','Flood the zone'),answer('verticals','Four verticals'),answer('power','Power run')];
 }
 case 'finish':{
  if(!mine)return [
   {key:'pressure',name:'Pressure the kicker',detail:'A block ends their possession; a miss gives up no points.'},
   {key:'contain',name:'Defend the goal line',detail:'Keeps the runner in front of you if they go for it.'}];
  const distance=fieldGoalDistance(game.possession??'home',game.yardLine);
  const toGo=yardsToGoal(game.possession??'home',game.yardLine);
  return [
   {key:'field-goal',name:`Kick a ${distance}-yard field goal`,detail:'Three points if your kicker has the range.'},
   {key:'go',name:toGo<=5?'Goal-line push for the touchdown':`Go for it from ${toGo} yards out`,detail:toGo<=5?'One run against their goal-line front.':`${toGo} yards to the endzone in a single play.`}];
 }
 case 'conversion':{
  if(!mine)return [
   {key:'block',name:'Pressure the kick',detail:'A block denies the extra point.'},
   {key:'contain',name:'Defend the two-point play',detail:'Keeps the runner out of the endzone.'}];
  return [
   {key:'extra-point',name:'Kick the extra point',detail:'One point, rarely missed.'},
   {key:'two-point',name:'Go for two',detail:'One matchup at the goal line for two points.'}];
 }
 default:return [];
 }
}

interface Resolution {title:string;detail:string;yards:number;action:FootballActionKind;scored:number;actors:FootballActor[];play?:FootballPlay;endPhase:StadiumPhase|'next-possession';endYard:number;scoringSide?:Possession}

/** Begin the possession that follows, or end the game when both teams have had one. */
function advancePossession(game:StadiumFootballGame):StadiumFootballGame{
 const index=(game.possessionIndex??0)+1;
 if(index>=2)return {...game,phase:'final'};
 const next:Possession=game.possession==='home'?'away':'home';
 return {...game,possession:next,possessionIndex:index,phase:'return',yardLine:next==='home'?20:80};
}

export function applyStadiumFootball(club:GameState,action:StadiumAction,now:number,random:()=>number):GameState|string{
 const state=club.stadiumFootball??{game:null,history:[]},old=state.game;
 if(action.type==='stadium.start'){
  if(old&&!old.collected)return 'Finish and collect your current Stadium game first.';
  if(club.development?.schedule)return 'Finish your team schedule before taking the field.';
  if(club.buildings.some(b=>b.activeDrillId))return 'Collect your workout before playing football.';
  if(club.resources.ENERGY<FOOTBALL_ENTRY_ENERGY)return 'A Stadium game needs 10 Energy.';
  const seed=Math.floor(random()*0x7fffffff);
  const receivesFirst:Possession=seeded(seed,'toss')<.5?'home':'away';
  const game:StadiumFootballGame={
   id:`football_${now}_${Math.floor(random()*1e9)}`,opponent:action.opponent,phase:'return',turn:0,startedAt:now,home:0,away:0,
   yardLine:receivesFirst==='home'?20:80,ratings:footballRatings(club),events:[],collected:false,reward:0,
   v:STADIUM_RULES_VERSION,possession:receivesFirst,possessionIndex:0,receivesFirst,seed,lineup:lineupSnapshot(club),
  };
  return {...club,teamReadiness:Math.max(0,club.teamReadiness-12),resources:{...club.resources,ENERGY:club.resources.ENERGY-FOOTBALL_ENTRY_ENERGY},stadiumFootball:{...state,game}};
 }
 if(!old||old.id!==action.gameId)return 'That Stadium game was not found.';
 if(action.type==='stadium.collect'){
  if(old.phase!=='final'||old.collected)return 'This result is not ready to collect.';
  return legacyCollectReward(club,now,state,old);
 }
 if(action.type==='stadium.abandon'){
  if(old.phase==='final')return 'This game is already over.';
  const away=Math.max(old.away,old.home+1);
  return {...club,stadiumFootball:{...state,game:{...old,phase:'final',away,reward:0,events:[...old.events,{turn:old.turn,phase:old.phase,call:'abandon',title:'Game conceded',detail:'No rewards. The entry Energy was spent at kickoff.',home:old.home,away,yards:0,possession:old.possession,direction:old.possession?driveDirection(old.possession):undefined,startYard:old.yardLine,endYard:old.yardLine,action:'concede',scored:0,actors:[]}]}}};
 }
 if(!isTwoPossessionGame(old))return applyLegacyStadiumCall(club,action,state,old,random);
 if(old.phase==='final'||String(old.turn)!==action.turn||!footballCalls(old).some(c=>c.key===action.call))return 'That play call is out of date. Use the current decision.';

 const possession=old.possession??'home';
 const mine=possession==='home';
 const opponent=STADIUM_OPPONENTS[old.opponent],r=old.ratings;
 const advantage=(r.attack-opponent.power)/Math.max(25,opponent.power);
 const defAdv=(r.defense-opponent.power)/Math.max(25,opponent.power);
 const roll=random(),call=action.call;
 const resolution=resolve(old,call,roll,{mine,possession,advantage,defAdv,opponent,r,random});
 let game:StadiumFootballGame={...old,turn:old.turn+1,yardLine:resolution.endYard};
 if(resolution.scored){const side=resolution.scoringSide??possession;if(side==='home')game.home+=resolution.scored;else game.away+=resolution.scored;}
 game.events=[...old.events,{
  turn:old.turn,phase:old.phase,call,title:resolution.title,detail:resolution.detail,home:game.home,away:game.away,
  play:resolution.play,yards:resolution.yards,possession,direction:driveDirection(possession),
  startYard:old.yardLine,endYard:resolution.endYard,action:resolution.action,scored:resolution.scored,actors:resolution.actors,
 }];
 if(resolution.endPhase==='next-possession')game=advancePossession(game);
 else game.phase=resolution.endPhase;
 // A conversion that cannot change win, tie or loss is not a decision: skip it.
 if(game.phase==='conversion'&&!conversionMatters(game))game=advancePossession(game);
 if(game.phase==='final')game.reward=game.home>game.away?opponent.reward:game.home===game.away?Math.round(opponent.reward*.5):20;
 return {...club,stadiumFootball:{...state,game}};
}

interface ResolveContext {mine:boolean;possession:Possession;advantage:number;defAdv:number;opponent:typeof STADIUM_OPPONENTS[StadiumOpponent];r:FootballRating;random:()=>number}

function resolve(game:StadiumFootballGame,call:string,roll:number,ctx:ResolveContext):Resolution{
 const {mine,possession,advantage,defAdv,opponent,r}=ctx;
 const scoringSide:Possession=possession;
 const actor=(slot:LineupSlotId,attribute:FootballActor['attribute'])=>{const a=actorFor(game,slot,attribute,r);return a?[a]:[];};
 switch(game.phase){
 case 'return':{
  if(mine){
   const coverage=returnCoverageOf(game);
   const quality=laneQuality(coverage,call);
   const base=18+quality.bonus+r.speed*.35+roll*14+advantage*6;
   if(roll<quality.breakaway+bounded((r.speed-15)/220,0,.06)){
    return {title:'Kickoff return touchdown!',detail:`${COVERAGE_TEXT[coverage]} ${quality.note} Your returner took it the distance.`,yards:80,action:'touchdown',scored:6,actors:actor('RECEIVER','speed'),endPhase:'conversion',endYard:ENDZONE.away,scoringSide};
   }
   const yards=Math.round(bounded(base,8,52));
   const end=advance(possession,game.yardLine,yards);
   return {title:`Return to ${describeYard(end)}`,detail:`${COVERAGE_TEXT[coverage]} ${quality.note} ${yards} yards on the return.`,yards,action:'return',scored:0,actors:actor('RECEIVER','speed'),endPhase:'offense',endYard:end};
  }
  const squib=call==='squib';
  const threat=bounded(.18-defAdv*.12,.03,.35);
  if(!squib&&roll<threat){
   return {title:'They return the kickoff for a touchdown',detail:'Your coverage team was beaten to the sideline. Kicking deep gave them the runway.',yards:80,action:'touchdown',scored:6,actors:actor('COVER','speed'),endPhase:'conversion',endYard:ENDZONE.home,scoringSide};
  }
  const yards=Math.round(bounded((squib?16:28)-defAdv*8+roll*10,6,48));
  const end=advance(possession,game.yardLine,yards);
  return {title:`They start at ${describeYard(end)}`,detail:squib?'The squib kick kept the return short and handed them the field position.':'Your coverage team made the tackle after a full return.',yards,action:'kick',scored:0,actors:actor('COVER','speed'),endPhase:'offense',endYard:end};
 }
 case 'offense':{
  if(mine){
   const play=call as FootballPlay;
   const look=defensiveLookOf(game);
   const answers=PLAY_ANSWER[play]===look;
   const talent=play==='power'?r.power:play==='verticals'?r.speed:r.iq;
   const mastery=r.mastery[play]??0;
   const toGoal=yardsToGoal(possession,game.yardLine);
   const scoreChance=bounded(.2+advantage*.24+(answers?.16:-.06)+(talent-15)*.004+r.readiness*.0008+mastery*.008-(toGoal/260),.04,.9);
   const failChance=PLAY_RISK[play]*(answers?.6:1.35);
   const actors=[...actor(SLOT_FOR_PLAY[play],ATTRIBUTE_FOR_PLAY[play]),...actor(play==='power'?'LINE1':'QB',play==='power'?'power':'iq')];
   const base=`${FOOTBALL_PLAYS[play]?.name??play} against ${LOOK_TEXT[look].toLowerCase().replace(/^they are /,'a defense ').replace(/\.$/,'')}. ${answers?'The call answered their look.':'Their look was set up against it.'} Mastery ${mastery}/20.`;
   if(roll<scoreChance){
    return {title:'Touchdown!',detail:`${base} ${toGoal} yards, all at once.`,yards:toGoal,action:'touchdown',scored:6,actors,endPhase:'conversion',endYard:possession==='home'?ENDZONE.away:ENDZONE.home,play,scoringSide};
   }
   if(roll>1-failChance){
    return {title:'The play breaks down',detail:`${base} No gain: the possession moves straight to your decision.`,yards:0,action:play==='power'?'run':'pass',scored:0,actors,endPhase:'finish',endYard:game.yardLine,play};
   }
   const yards=Math.round(bounded(8+advantage*9+roll*14+(answers?6:0),1,Math.max(1,toGoal-1)));
   const end=advance(possession,game.yardLine,yards);
   return {title:`${yards} yards to ${describeYard(end)}`,detail:`${base} One decision left on this possession.`,yards,action:play==='power'?'run':'pass',scored:0,actors,endPhase:'finish',endYard:end,play};
  }
  const theirRoll=seeded(game.seed??0,`theirplay:${game.possessionIndex??0}`);
  const theirPlay:FootballPlay=theirRoll<.34?'slants':theirRoll<.67?'verticals':'power';
  const counters=(call==='zone'&&theirPlay==='verticals')||(call==='man'&&theirPlay==='slants')||(call==='stack'&&theirPlay==='power');
  const toGoal=yardsToGoal(possession,game.yardLine);
  const theirScore=bounded(.2-defAdv*.22+(counters?-.14:.08)+(toGoal<30?.1:0),.03,.85);
  const actors=[...actor(counters?'BACKER':'RUSHER','iq'),...actor('SAFETY','overall')];
  const name=FOOTBALL_PLAYS[theirPlay]?.name??theirPlay;
  if(roll<theirScore){
   return {title:'They score a touchdown',detail:`They called ${name} against your ${call}. ${counters?'Your call was right but they executed anyway.':'Your call left that option open.'}`,yards:toGoal,action:'touchdown',scored:6,actors,endPhase:'conversion',endYard:possession==='home'?ENDZONE.away:ENDZONE.home,play:theirPlay,scoringSide};
  }
  if(roll>.9){
   return {title:'Stopped for no gain',detail:`Your ${call} met ${name} at the line. They face a decision from where they stand.`,yards:0,action:'stop',scored:0,actors,endPhase:'finish',endYard:game.yardLine,play:theirPlay};
  }
  const yards=Math.round(bounded(7-defAdv*7+roll*12+(counters?-4:4),1,Math.max(1,toGoal-1)));
  const end=advance(possession,game.yardLine,yards);
  return {title:`They gain ${yards} to ${describeYard(end)}`,detail:`Your ${call} against ${name}. ${counters?'The call took their first option away.':'They found the space your call left.'}`,yards,action:'stop',scored:0,actors,endPhase:'finish',endYard:end,play:theirPlay};
 }
 case 'finish':{
  const toGoal=yardsToGoal(possession,game.yardLine);
  if(mine){
   if(call==='field-goal'){
    const distance=fieldGoalDistance(possession,game.yardLine);
    const kicker=kickerOf(game);
    const steadiness=kicker?kicker.power:Math.round(r.iq*3);
    const chance=bounded(.97-(distance-20)*.017+(steadiness-30)*.004,.03,.97);
    const made=roll<chance;
    const actors:FootballActor[]=kicker?[{slot:'BACK',name:kicker.name,role:kicker.role,attribute:'overall',value:kicker.power}]:[];
    return {title:made?`${distance}-yard field goal is good`:`${distance}-yard field goal is no good`,detail:`${kicker?`${kicker.name} took the kick. `:''}A ${distance}-yard attempt at ${Math.round(chance*100)}% for this club.`,yards:0,action:'field-goal',scored:made?3:0,actors,endPhase:'next-possession',endYard:game.yardLine,scoringSide};
   }
   const goalLine=toGoal<=5;
   const chance=bounded((goalLine?.5:.3)+advantage*.2+(r.power-15)*.004-(goalLine?0:toGoal*.006),.05,.9);
   const made=roll<chance;
   const actors=actor('BACK','power');
   if(made)return {title:goalLine?'Goal-line touchdown':`${toGoal}-yard touchdown`,detail:goalLine?'The runner followed the lead block through their front.':`They had to cover ${toGoal} yards in one play, and did.`,yards:toGoal,action:'touchdown',scored:6,actors,endPhase:'conversion',endYard:possession==='home'?ENDZONE.away:ENDZONE.home,play:'power',scoringSide};
   return {title:goalLine?'Goal-line stand':'Stopped short',detail:`${toGoal} yards was too far on one play. The possession ends with no points.`,yards:0,action:'stop',scored:0,actors,endPhase:'next-possession',endYard:game.yardLine,play:'power'};
  }
  const pressure=call==='pressure';
  const theyKick=seeded(game.seed??0,`theirfinish:${game.possessionIndex??0}`)<(toGoal>8?.72:.3);
  const actors=[...actor(pressure?'RUSHER':'BACKER','power'),...actor('SAFETY','overall')];
  if(theyKick){
   const distance=fieldGoalDistance(possession,game.yardLine);
   const chance=bounded(.9-(distance-20)*.015-(pressure?.14:0)+defAdv*-.05,.05,.95);
   const made=roll<chance;
   return {title:made?`Their ${distance}-yard field goal is good`:`Their ${distance}-yard field goal misses`,detail:pressure?'You sent pressure at the kick.':'You stayed back to defend the goal line; they took the points.',yards:0,action:'field-goal',scored:made?3:0,actors,endPhase:'next-possession',endYard:game.yardLine,scoringSide};
  }
  const chance=bounded(.45-defAdv*.2-(pressure?0:.16)-(toGoal>5?toGoal*.01:0),.05,.9);
  const made=roll<chance;
  if(made)return {title:'They convert for a touchdown',detail:pressure?'You pressured instead of defending the goal line, and they ran through it.':'You defended the goal line and they still got in.',yards:toGoal,action:'touchdown',scored:6,actors,endPhase:'conversion',endYard:possession==='home'?ENDZONE.away:ENDZONE.home,play:'power',scoringSide};
  return {title:'They are stopped short',detail:pressure?'The pressure got there before the runner did.':'Your goal-line defence held them out.',yards:0,action:'stop',scored:0,actors,endPhase:'next-possession',endYard:game.yardLine,play:'power'};
 }
 case 'conversion':{
  if(mine){
   const two=call==='two-point';
   const kicker=kickerOf(game);
   const chance=two?bounded(.46+advantage*.2+(r.power-15)*.004,.1,.9):bounded(.95+(kicker?(kicker.power-30)*.0015:0),.7,.99);
   const made=roll<chance;
   const actors=two?actor('BACK','power'):kicker?[{slot:'BACK' as LineupSlotId,name:kicker.name,role:kicker.role,attribute:'overall' as const,value:kicker.power}]:[];
   return {title:made?(two?'Two-point conversion is good':'Extra point is good'):(two?'Two-point conversion stopped':'Extra point missed'),detail:two?'One matchup at the goal line decided it.':`${kicker?`${kicker.name} `:''}took the kick after the touchdown.`,yards:0,action:'conversion',scored:made?(two?2:1):0,actors,endPhase:'next-possession',endYard:game.yardLine,scoringSide};
  }
  const theyGoForTwo=conversionWouldWin(game);
  const block=call==='block';
  const chance=theyGoForTwo?bounded(.48-defAdv*.18-(block?0:.12),.08,.9):bounded(.95-(block?.1:0),.6,.98);
  const made=roll<chance;
  const actors=actor(block?'RUSHER':'BACKER','power');
  return {title:made?(theyGoForTwo?'They convert for two':'Their extra point is good'):(theyGoForTwo?'Their two-point try is denied':'Their extra point is blocked'),detail:theyGoForTwo?'They needed two, and you defended it accordingly.':block?'You sent the rush at the kick.':'You stayed home against the two-point look.',yards:0,action:'conversion',scored:made?(theyGoForTwo?2:1):0,actors,endPhase:'next-possession',endYard:game.yardLine,scoringSide};
 }
 default:return {title:'',detail:'',yards:0,action:'stop',scored:0,actors:[],endPhase:'final',endYard:game.yardLine};
 }
}
/** The opponent goes for two only when one point is not enough to change the outcome. */
function conversionWouldWin(game:StadiumFootballGame):boolean{
 const theirs=game.possession==='home'?game.home:game.away;
 const ours=game.possession==='home'?game.away:game.home;
 return theirs+1<=ours&&theirs+2>ours;
}
/** Human-readable spot: "your 35" / "their 22" / "midfield". */
export function describeYard(yardLine:number):string{
 const spot=Math.round(bounded(yardLine,0,100));
 if(spot===50)return 'midfield';
 return spot<50?`your ${spot}`:`their ${100-spot}`;
}

export function validStadiumFootball(input:unknown):input is StadiumFootballState{
 if(!input||typeof input!=='object')return false;const s=input as StadiumFootballState;const int=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 if(!Array.isArray(s.history)||s.history.length>20||s.history.some(h=>!h||typeof h.id!=='string'||!Object.prototype.hasOwnProperty.call(STADIUM_OPPONENTS,h.opponent)||![h.home,h.away,h.reward,h.at].every(int)))return false;
 const g=s.game;if(g===null||g===undefined)return true;
 const ratingsOk=!!g.ratings&&['attack','defense','speed','power','iq','readiness'].every(k=>Number.isFinite(g.ratings[k as keyof FootballRating])&&Number(g.ratings[k as keyof FootballRating])>=0)
  &&!!g.ratings.mastery&&Object.entries(g.ratings.mastery).every(([k,v])=>Object.prototype.hasOwnProperty.call(FOOTBALL_PLAYS,k)&&int(v)&&(v as number)<=20);
 const eventsOk=Array.isArray(g.events)&&g.events.length<=16&&g.events.every(e=>e&&typeof e.title==='string'&&typeof e.detail==='string'&&typeof e.call==='string'&&[e.turn,e.home,e.away,e.yards].every(int)
  &&(e.possession===undefined||e.possession==='home'||e.possession==='away')
  &&(e.direction===undefined||e.direction===1||e.direction===-1)
  &&(e.startYard===undefined||(int(e.startYard)&&e.startYard<=100))&&(e.endYard===undefined||(int(e.endYard)&&e.endYard<=100))
  &&(e.scored===undefined||(int(e.scored)&&e.scored<=6))
  &&(e.actors===undefined||(Array.isArray(e.actors)&&e.actors.length<=4&&e.actors.every(a=>!!a&&typeof a.name==='string'&&a.name.length<=120&&typeof a.slot==='string'&&Number.isFinite(a.value)))));
 const v2=g.v===STADIUM_RULES_VERSION;
 const v2Ok=!v2||((g.possession==='home'||g.possession==='away')&&int(g.possessionIndex)&&(g.possessionIndex as number)<=2
  &&(g.receivesFirst==='home'||g.receivesFirst==='away')&&int(g.seed)&&(g.lineup===undefined||validLineupSnapshot(g.lineup)));
 return !!g&&typeof g.id==='string'&&Object.prototype.hasOwnProperty.call(STADIUM_OPPONENTS,g.opponent)
  &&['return','offense','finish','conversion','kickoff','defense','defend-finish','final'].includes(g.phase)
  &&[g.turn,g.startedAt,g.home,g.away,g.yardLine,g.reward].every(int)&&g.turn<=16&&g.home<=40&&g.away<=40&&g.yardLine<=100&&g.reward<=220
  &&typeof g.collected==='boolean'&&(g.v===undefined||g.v===STADIUM_RULES_VERSION)&&ratingsOk&&eventsOk&&v2Ok;
}
