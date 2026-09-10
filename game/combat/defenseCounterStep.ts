import type { BTroop, BBuilding } from '../../battle';
import { nearestTroop } from '../../battle';
import type { BattleEngine } from './engine';
import { EQUIPMENT_COUNTERS, counterRole, defenseResistance, displaceFrom, splashFalloff } from './defenseCounters';

type State=BattleEngine['state'];
/** Fixed-tick warnings, locked impact areas, and role-aware equipment outcomes. */
export function stepCounterEquipment(b:BBuilding,s:State,dt:number,hit:(t:BTroop,damage:number)=>void) {
  const flavor=b.flavor??'jugs',rule=EQUIPMENT_COUNTERS[flavor];
  b.cooldown-=dt;
  if((b.level??0)>=10)b.counterSignatureT=(b.counterSignatureT??5)-dt;
  let attack=b.counterAttack;
  if(!attack){
    if(b.cooldown>0)return;
    const target=nearestTroop(b.x,b.y,s.troops,b.range!);
    if(!target)return;
    const signature=(b.level??0)>=10&&(b.counterSignatureT??1)<=0;
    attack=b.counterAttack={targetId:target.id,x:target.x,y:target.y,remaining:rule.windup,signature};
    if(rule.windup){
      s.pulses.push({x:attack.x,y:attack.y,r:rule.radius||3,life:rule.windup,maxLife:rule.windup,color:'#fef08a'});
      s.fx.push({type:'yards',text:`${signature?'POWER ':''}${rule.name.toUpperCase()} →`,x:b.x,y:b.y-4,life:rule.windup,maxLife:rule.windup,color:'#fef08a'});
      return;
    }
  }
  attack.remaining-=dt;
  if(attack.remaining>0)return;
  b.counterAttack=undefined;b.cooldown=rule.cooldown;
  const target=s.troops.find(t=>t.id===attack!.targetId&&!t.dead);
  const signature=attack.signature;
  if(signature)b.counterSignatureT=flavor==='sled'?8:flavor==='ref'?11:flavor==='jugs'?9:10;
  // Single-target attacks can be avoided by leaving range during their warning.
  if(!['cooler','tshirt'].includes(flavor)&&(!target||Math.hypot(target.x-b.x,target.y-b.y)>b.range!))return;
  const radius=rule.radius*(signature?1.6:1);
  if(flavor==='cooler') {
    s.puddles.push({x:attack.x,y:attack.y,r:radius,life:signature?5:rule.duration,maxLife:signature?5:rule.duration});
  } else if(flavor==='tshirt') {
    for(const t of s.troops){if(t.dead)continue;const falloff=splashFalloff(Math.hypot(t.x-attack.x,t.y-attack.y),radius);if(!falloff)continue;
      hit(t,b.damage!*rule.damage*falloff*(signature?1.4:1));t.braceT=Math.max(t.braceT??0,rule.duration*falloff);t.lastDefenseEffect='Shirt entanglement';}
    s.pulses.push({x:attack.x,y:attack.y,r:radius,life:.35,maxLife:.35,color:'#f472b6'});
  } else if(target) {
    const resist=defenseResistance(target);
    if(flavor==='sled'){
      hit(target,b.damage!*rule.damage*(.65+.35*resist.brace)*(signature?1.4:1));
      displaceFrom(target,b,(signature?5:1.6)*resist.brace,s.buildings);
      target.braceT=Math.max(target.braceT??0,rule.duration*resist.brace);target.lastDefenseEffect=resist.brace<1?'Braced sled impact':'Sled knockback';
    } else if(flavor==='ref'){
      const targets=signature?s.troops.filter(t=>!t.dead&&Math.hypot(t.x-b.x,t.y-b.y)<=b.range!):[target];
      for(const t of targets){hit(t,b.damage!*rule.damage);t.flagT=Math.max(t.flagT??0,rule.duration*defenseResistance(t).discipline);t.lastDefenseEffect='Flag: movement and attack disrupted';}
    } else {
      const raw=b.damage!*(signature?2.2:1);
      const blocker=s.troops.find(t=>!t.dead&&t.id!==target.id&&counterRole(t)==='OL'&&Math.hypot(t.x-target.x,t.y-target.y)<=5);
      if(blocker){const intercepted=Math.min(blocker.hp,raw*.35);const prevented=Math.min(target.hp,raw)-Math.min(target.hp,raw-intercepted);hit(blocker,intercepted);hit(target,raw-intercepted);blocker.protectionDone=(blocker.protectionDone??0)+prevented;blocker.lastDefenseEffect='Intercepted JUGS pressure';}
      else hit(target,raw);
      target.lastDefenseEffect=blocker?'Protected from JUGS':'JUGS pressure';
    }
  }
  s.shots.push({sx:b.x,sy:b.y,tx:rule.radius?attack.x:target?.x??attack.x,ty:rule.radius?attack.y:target?.y??attack.y,t:0,dur:.3,rot:0,flavor});
}
