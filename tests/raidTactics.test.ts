import { reachableRally } from '../game/raidOrderAccess';
import { describe, expect, it } from 'vitest';
import { UnitGroup } from '../types';
import { type BTroop, type BBuilding, type ReplayData } from '../battle';
import { createBattleEngine, replayMatch } from '../game/combat/engine';
import { createRaidTactics, supportingPasser, validRaidOrder } from '../game/combat/raidTactics';
import { createRaidNavigator, footprint, laneClear, raidRoute } from '../game/combat/raidNavigation';
import { heroPracticeConfig } from '../game/combat/practice';
import { validateReplay } from '../game/combat/replay';
import films from './fixtures/defense-v4-films.json';
import { stepCounterEquipment } from '../game/combat/defenseCounterStep';

const actor = (id:string,role='WR',x=10,y=50):BTroop => ({id,role,unit:role==='OL'?UnitGroup.OFFENSE_LINE:UnitGroup.OFFENSE_SKILL,x,y,hp:500,maxHp:500,dps:30,speed:12,range:6,targetId:null,dead:false,hitFlash:0,rageT:0,healT:0});
const building = (id='target',x=70,y=50,size=8):BBuilding => ({id,kind:'building',x,y,size,hp:10000,maxHp:10000,dead:false,cooldown:0});
const model = (troops:BTroop[],guards:BTroop[]=[],buildings:BBuilding[]=[building()]) => {
  const state={troops,guards,buildings,ticks:0};
  const tactics=createRaidTactics(state,{events:()=>{},hit:()=>{},release:()=>{},guardDown:()=>{},playerDown:()=>{}});
  const tick=(n=1)=>{for(let i=0;i<n;i++){state.ticks++;tactics.step(.05);for(const t of troops)if(!t.dead)tactics.troop(t,t.dps,t.speed,.05);tactics.guards(.05);}};
  return {state,tactics,tick};
};

describe('raid orders and real football support',()=>{
  it('keeps every defense-counters-4 film byte-for-byte reproducible',()=>{
    for(const {id,film} of films){expect(validateReplay(film),id).not.toBeNull();expect(replayMatch(film as ReplayData).matches,id).toBe(true);}
  });
  it('does not offer an unreachable rally inside a closed enclosure',()=>{
    const walls=Array.from({length:16},(_,i)=>({...building(`wall-${i}`,50+Math.cos(i*Math.PI/8)*12,50+Math.sin(i*Math.PI/8)*12,6),kind:'wall' as const}));
    expect(reachableRally({x:50,y:50},[],walls)).toBe(false);
    expect(reachableRally({x:5,y:50},[],walls)).toBe(true);
    expect(reachableRally({x:50,y:50},[],[building('occupied',50,50)])).toBe(false);
    walls.forEach(w=>w.dead=true);expect(reachableRally({x:50,y:50},[],walls)).toBe(true);
  });
  it('focuses a called target instead of the closer facility, then resumes after it falls',()=>{
    const t=actor('runner'),near=building('near',25,35),far=building('far',55,60),m=model([t],[],[near,far]);
    expect(m.tactics.command({tick:0,k:'o',key:'focus',targetId:'far'})).toBe(true);
    m.tick(130);expect(far.hp).toBeLessThan(far.maxHp);expect(near.hp).toBe(near.maxHp);
    far.dead=true;far.hp=0;m.tick(160);expect(near.hp).toBeLessThan(near.maxHp);
  });
  it('rallies away from contact, affects future group deployments, and rejects occupied turf',()=>{
    const t=actor('first'),m=model([t]);
    expect(m.tactics.command({tick:0,k:'o',key:'push',x:10,y:15,u:UnitGroup.OFFENSE_SKILL})).toBe(true);
    const next=actor('next','WR',12,50);m.state.troops.push(next);
    m.tick(35);expect(t.y).toBeLessThan(33);expect(next.y).toBeLessThan(33);
    expect(m.tactics.command({tick:35,k:'o',key:'push',x:70,y:50})).toBe(false);
    expect(m.tactics.command({tick:35,k:'o',key:'auto'})).toBe(true);m.tick(180);
    expect(m.state.buildings[0].hp).toBeLessThan(10000);
  });
  it('only supports receivers near a QB with an unobstructed lane',()=>{
    const wr=actor('wr','WR',30,40),qb=actor('qb','QB',20,40);
    expect(supportingPasser(wr,[wr,qb],[])).toBe(qb);
    qb.x=5;expect(supportingPasser(wr,[wr,qb],[])).toBeUndefined();
    qb.x=20;expect(supportingPasser(wr,[wr,qb],[building('wall',25,40,3)])).toBeUndefined();
    qb.dead=true;expect(supportingPasser(wr,[wr,qb],[])).toBeUndefined();
    qb.dead=false;qb.engagementId='rusher';expect(supportingPasser(wr,[wr,qb],[])).toBeUndefined();
  });
  it('a blocker occupies a defender without simultaneously damaging a facility',()=>{
    const qb={...actor('hero','QB',20,50),isHero:true,heroKey:'qb'},ol=actor('ol','OL',23,50),g=actor('guard','LB',26,50),b=building('target',30,50,2);
    const m=model([qb,ol],[g],[b]);m.tactics.command({tick:0,k:'o',key:'protect',targetId:qb.id,u:UnitGroup.OFFENSE_LINE});
    m.tick(1);expect(g.targetId).toBe(ol.id);expect(ol.blockSeconds).toBeGreaterThan(0);expect(ol.protectionDone).toBeGreaterThan(0);
    expect(qb.hp).toBe(500);expect(b.hp).toBe(10000);expect(g.hp).toBeLessThan(500);
  });
  it('protect orders remain near a hero instead of chasing a far facility',()=>{
    const hero={...actor('hero','QB',20,20),isHero:true,heroKey:'qb'},ol=actor('ol','OL',22,20),m=model([hero,ol]);
    m.tactics.command({tick:0,k:'o',key:'protect',targetId:hero.id,u:UnitGroup.OFFENSE_LINE});
    for(let i=0;i<100;i++){m.state.ticks++;m.tactics.troop(ol,ol.dps,ol.speed,.05);}
    expect(Math.hypot(ol.x-hero.x,ol.y-hero.y)).toBeLessThanOrEqual(5);expect(m.state.buildings[0].hp).toBe(10000);
  });
  it('a normal QB pass lands after release, with no reward damage ahead of the ball',()=>{
    const qb=actor('qb','QB',55,50),b=building(),m=model([qb],[],[b]);qb.range=14;
    m.tick();expect(b.hp).toBe(10000);expect(m.tactics.ballInPlay).toBe(true);
    qb.dead=true;m.tick(12);expect(b.hp).toBeLessThan(10000);expect(m.tactics.ballInPlay).toBe(false);
  });
  it('routes both runners and emerging defenders around live structures',()=>{
    const obstacle=building('block',35,50,16),t=actor('runner','WR',10,50),nav=createRaidNavigator([obstacle]);
    expect(laneClear(t,{x:60,y:50},[obstacle])).toBe(false);
    expect(raidRoute(t,{x:60,y:50},[obstacle])).not.toBeNull();
    for(let i=0;i<180;i++){nav.move(t,{x:60,y:50},12,.05,i,2);expect(Math.hypot(t.x-obstacle.x,t.y-obstacle.y)).toBeGreaterThanOrEqual(footprint(obstacle)-1e-8);}
    expect(t.x).toBeGreaterThan(55);
    const g=actor('emerging','LB',35,50);
    for(let i=0;i<100;i++)nav.move(g,{x:60,y:50},12,.05,i,2);
    expect(g.x).toBeGreaterThan(55);
  });
  it('can clear overlapping structures in existing published layouts',()=>{
    const t=actor('runner','WR',10,50),a=building('a',40,50,8),b=building('b',40,50,10),m=model([t],[],[a,b]);
    a.hp=a.maxHp=40;b.hp=b.maxHp=40;
    m.tactics.command({k:'o',key:'focus',targetId:a.id,tick:0});m.tick(200);
    expect(a.dead).toBe(true);expect(b.dead).toBe(true);
  });
  it('a rally can evade a locked cannon area during its visible warning',()=>{
    const t=actor('runner','WR',60,50);t.speed=18;
    const b={...building('cannon',50,50,2),kind:'defense' as const,flavor:'tshirt' as const,damage:20,range:24};
    const e=createBattleEngine({mode:'attack',title:'Warning test',buildings:[b],loot:{coins:0,fans:0}},1),s=e.state;
    s.troops=[t];s.guards=[];s.buildings=[b];
    const m=model(s.troops,[],s.buildings),hit=(p:BTroop,n:number)=>{p.hp-=n};
    stepCounterEquipment(b,s,.05,hit,true);expect(b.counterAttack?.remaining).toBe(.75);
    m.tactics.command({tick:0,k:'o',key:'push',x:90,y:50});
    for(let i=0;i<16;i++){m.tick();stepCounterEquipment(b,s,.05,hit,true);}
    expect(t.hp).toBe(500);expect(t.x).toBeGreaterThan(67);
  });
  it('walls interrupt machine pressure, while a zero-damage Water Station still controls turf',()=>{
    const t=actor('runner','WR',70,50),gear={...building('jugs',50,50,2),kind:'defense' as const,flavor:'jugs' as const,damage:20,range:25};
    const s=createBattleEngine({mode:'attack',title:'Cover test',buildings:[gear],loot:{coins:0,fans:0}},1).state;
    s.troops=[t];s.buildings=[gear,building('wall',60,50,4)];
    for(let i=0;i<30;i++)stepCounterEquipment(gear,s,.05,(p,n)=>{p.hp-=n},true);
    expect(t.hp).toBe(500);expect(gear.counterAttack).toBeUndefined();
    const c=heroPracticeConfig('qb');c.buildings=[{...gear,flavor:'cooler',damage:0,x:22,y:50}];
    const water=createBattleEngine(c,1);water.command({k:'h',key:'qb',x:5,y:50,tick:0});
    for(let i=0;i<20;i++)water.advance();expect(water.state.puddles.length).toBeGreaterThan(0);
  });
  it('replays orders exactly and rejects foreign, malformed or legacy order commands',()=>{
    const c=heroPracticeConfig('qb'),e=createBattleEngine(c,771);
    expect(e.command({k:'o',key:'focus',targetId:'foreign',tick:0})).toBe(false);
    expect(validRaidOrder({k:'o',key:'push',x:NaN,y:5,tick:0})).toBe(false);
    expect(e.command({k:'h',key:'qb',x:5,y:50,tick:0})).toBe(true);
    expect(e.command({k:'o',key:'focus',targetId:c.buildings[0].id,tick:0})).toBe(true);
    expect(e.command({k:'a',key:'qb',tick:0})).toBe(true);expect(e.actions.current[0].targetId).toBe(c.buildings[0].id);
    for(let i=0;i<110;i++)e.advance();
    expect(e.command({k:'o',key:'push',x:5,y:25,tick:e.state.ticks})).toBe(true);
    for(let i=0;i<80;i++)e.advance();e.finish();
    const film=e.getReplay();expect(validateReplay(film)).not.toBeNull();expect(replayMatch(film).matches).toBe(true);
    expect(validateReplay({...film,rules:'defense-counters-4'})).toBeNull();
    const old=createBattleEngine({...c,authority:{rules:'defense-counters-4',seed:771,matchId:'old',issuedAt:0,expiresAt:100000}},771);
    expect(old.command({k:'o',key:'auto',tick:0})).toBe(false);
  });
});
