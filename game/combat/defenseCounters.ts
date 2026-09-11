import { UnitGroup } from '../../types';
import type { BTroop, BBuilding } from '../../battle';
export const LEGACY_COMBAT_RULES = 'hero-actions-3';
export const DEFENSE_COUNTER_RULES = 'defense-counters-4';
export const RAID_TACTICS_RULES = 'raid-tactics-5';
export const supportsCombatRules = (v: unknown): v is string => v === LEGACY_COMBAT_RULES || v === DEFENSE_COUNTER_RULES || v === RAID_TACTICS_RULES;
export type EquipmentFlavor = 'jugs'|'sled'|'ref'|'tshirt'|'cooler';
export const EQUIPMENT_COUNTERS = {
  jugs: { name:'JUGS', cooldown:.55, windup:0, damage:1, radius:0, duration:0, counter:'Deploy blockers first. Nearby offensive linemen absorb pressure for vulnerable players.' },
  sled: { name:'Sled', cooldown:1.1, windup:.3, damage:1.8, radius:0, duration:.6, counter:'Linemen brace against the impact. Ranged players can attack from outside its reach.' },
  ref: { name:'Ref Tower', cooldown:1.5, windup:.55, damage:1.6, radius:0, duration:1.4, counter:'Higher IQ shortens the flag. Leave its range during the warning to avoid the call.' },
  tshirt: { name:'T-Shirt Cannon', cooldown:1.15, windup:.3, damage:1.4, radius:7, duration:.9, counter:'Spread out. Damage and entanglement fall to 35% at the edge of the marked area.' },
  cooler: { name:'Water Station', cooldown:3.2, windup:.4, damage:0, radius:7, duration:3.5, counter:'Water controls turf without direct damage. RB, WR and CB retain 80% speed; other roles retain 60%.' },
} as const;
export const TACTICAL_WARNINGS = { jugs: .15, sled: .45, ref: .85, tshirt: .75, cooler: .65 } as const;
export function counterRole(t: Pick<BTroop,'role'|'unit'|'heroKey'>): string {
  if(t.role) return t.role;
  const heroes:Record<string,string>={qb:'QB',enforcer:'OL',captain:'OL',burner:'WR',playmaker:'WR',kicker:'QB',coach:'S',medic:'S',legend:'LB'};
  return heroes[t.heroKey??''] ?? ({[UnitGroup.OFFENSE_LINE]:'OL',[UnitGroup.OFFENSE_SKILL]:'WR',[UnitGroup.DEFENSE_LINE]:'DL',[UnitGroup.DEFENSE_SECONDARY]:'CB'}[t.unit]);
}
export function defenseResistance(t: Pick<BTroop,'role'|'unit'|'heroKey'|'chargeRate'>) {
  const role=counterRole(t),heavy=['OL','DL'].includes(role);
  return { brace:heavy?.35:role==='LB'?.65:1, traction:['RB','WR','CB'].includes(role)?.8:.6,
    discipline:1/Math.max(.7,Math.min(1.6,t.chargeRate??1)) };
}
export const splashFalloff=(distance:number,radius:number)=>distance>radius?0:1-.65*Math.max(0,distance)/radius;
export function counterSpeed(t:BTroop) {return Math.min((t.wetT??0)>0?defenseResistance(t).traction:1,(t.flagT??0)>0?.75:1,(t.braceT??0)>0?.65:1);}
export function tickCounterEffects(t:BTroop,dt:number) {if(Math.max(t.wetT??0,t.flagT??0,t.braceT??0)>0)t.defenseControlSeconds=(t.defenseControlSeconds??0)+dt;for(const key of ['wetT','flagT','braceT'] as const)t[key]=Math.max(0,(t[key]??0)-dt);}
export function displaceFrom(t:BTroop,b:BBuilding,distance:number,buildings:BBuilding[]) {
  const length=Math.hypot(t.x-b.x,t.y-b.y)||1,dx=(t.x-b.x)/length,dy=(t.y-b.y)/length;
  // Sweep in sub-unit steps; knockback cannot tunnel through a wall or facility.
  for(let moved=0;moved<distance;moved+=.25){const step=Math.min(.25,distance-moved),x=t.x+dx*step,y=t.y+dy*step;
    if(x<2||x>98||y<2||y>98||buildings.some(o=>!o.dead&&o.id!==b.id&&Math.hypot(x-o.x,y-o.y)<o.size*.5+.5))break;
    t.x=x;t.y=y;
  }
  t.plan=undefined;
}
