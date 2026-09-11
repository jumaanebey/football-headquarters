import { TROOP_STATS, UNIT_ORDER, type BBuilding, type BTroop, type RaidHero, type ReplayAction } from '../battle';
import type { UnitGroup } from '../types';
import { EQUIPMENT_COUNTERS } from '../game/combat/defenseCounters';
import type { RaidOrder } from '../game/combat/raidTactics';

export type RaidAim = 'push' | 'focus' | 'protect';
export const raidTargetName = (b: BBuilding) => b.kind === 'hq' ? 'Stadium' : b.kind === 'wall' ? 'Wall' : b.kind === 'defense' ? EQUIPMENT_COUNTERS[b.flavor ?? 'jugs'].name : 'Facility';
export function RaidOrders({ aim, onAim, scope, onScope, buildings, troops, heroes, onOrder, message }: {
  aim: RaidAim; onAim: (aim: RaidAim) => void; scope?: UnitGroup; onScope: (scope?: UnitGroup) => void;
  buildings: BBuilding[]; troops: BTroop[]; heroes: RaidHero[]; message: string;
  onOrder: (order: Omit<ReplayAction, 'tick' | 'k'>) => void;
}) {
  const liveHeroes = troops.filter(t => t.isHero && !t.dead);
  return <section className="fhq-raid-orders" aria-label="Squad orders">
    <label>Give orders to <select aria-label="Order group" value={scope ?? 'all'} onChange={event => onScope(event.target.value === 'all' ? undefined : event.target.value as UnitGroup)}>
      <option value="all">Whole team</option>{UNIT_ORDER.map(u => <option key={u} value={u}>{TROOP_STATS[u].label}</option>)}
    </select></label>
    <div className="fhq-order-actions">{([['push','Rally'],['focus','Focus'],['protect','Protect']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={aim===key} onClick={()=>onAim(key)}>{label}</button>)}<button type="button" onClick={()=>onOrder({key:'auto',u:scope})}>Auto</button></div>
    <p>{aim === 'push' ? 'Tap open turf to regroup or move out of a warning. Players resume attacking on arrival.' : aim === 'focus' ? 'Tap a building on the field, or choose its numbered target below.' : 'Choose a deployed hero. This group stays nearby and engages incoming defenders.'}</p>
    {aim==='focus'&&<div className="fhq-order-targets" aria-label="Raid targets">{buildings.filter(b=>!b.dead&&b.kind!=='wall').map(b=><button type="button" key={b.id} onClick={()=>onOrder({key:'focus',targetId:b.id,u:scope})}>{buildings.indexOf(b)+1} · {raidTargetName(b)}</button>)}</div>}
    {aim==='protect'&&<div className="fhq-order-targets" aria-label="Heroes to protect">{liveHeroes.length?liveHeroes.map(t=><button type="button" key={t.id} onClick={()=>onOrder({key:'protect',targetId:t.id,u:scope})}>{heroes.find(h=>h.key===t.heroKey)?.name??'Hero'}</button>):<span>Deploy a hero first.</span>}</div>}
    <p role="status" className="fhq-order-confirmation">{message || 'Orders also apply to this group’s next deployments.'}</p>
  </section>;
}

export function RaidOrderOverlay({ orders, troops, buildings, project, choosingTarget }: {
  orders: Map<string,RaidOrder>; troops:BTroop[]; buildings:BBuilding[];
  project:(x:number,y:number)=>{x:number;y:number}; choosingTarget:boolean;
}) {
  const marks = [...orders.values()].flatMap(order => {
    const target = order.key==='push'?{x:order.x!,y:order.y!}:order.key==='focus'?buildings.find(b=>b.id===order.targetId&&!b.dead):order.key==='protect'?troops.find(t=>t.id===order.targetId&&!t.dead):undefined;
    return target?[{order,target}]:[];
  });
  return <svg aria-hidden="true" viewBox="0 0 100 100" className="fhq-order-overlay">
    {marks.map(({order,target})=>{
      const p=project(target.x,target.y),color=order.key==='protect'?'#7dd3fc':order.key==='focus'?'#fbbf24':'#6ee7b7';
      return <g key={order.serial}>
        {troops.filter(t=>!t.dead&&(orders.get(t.isHero||t.special?'all':t.unit)??orders.get('all'))?.serial===order.serial).slice(0,6).map(t=>{const from=project(t.x,t.y);return <line key={t.id} x1={from.x} y1={from.y} x2={p.x} y2={p.y} stroke={color} strokeWidth=".35" strokeDasharray="1.2 1.2" opacity=".65"/>;})}
        <ellipse cx={p.x} cy={p.y} rx="4" ry="2.5" stroke={color} strokeWidth=".6" fill={`${color}25`}/>
        <path d={`M${p.x},${p.y-2}v-5l4,1.4-4,1.4`} stroke={color} strokeWidth=".6" fill={color}/>
      </g>;
    })}
    {choosingTarget&&buildings.map((b,i)=>{if(b.dead||b.kind==='wall')return null;const p=project(b.x,b.y);return <g key={b.id}><circle cx={p.x} cy={p.y-5} r="3.1" fill="#0f172a" stroke="#fbbf24" strokeWidth=".5"/><text x={p.x} y={p.y-4} textAnchor="middle" fontSize="3.2" fontWeight="800" fill="white">{i+1}</text></g>;})}
    {troops.filter(t=>!t.dead&&t.engagementId&&t.raidActivity==='Blocking a defender').map(t=>{const p=project(t.x,t.y);return <path key={t.id} d={`M${p.x-1.8},${p.y-3}h3.6v2q-1.8,2-3.6,0z`} fill="#7dd3fc" stroke="#082f49" strokeWidth=".35"/>;})}
  </svg>;
}
