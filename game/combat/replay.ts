import { supportsCombatRules } from './defenseCounters';
import { canonicalJson } from './canonical';
import { GAME_PLANS, HERO_DEFS, PLAYBOOK, SPECIALS, type ReplayData, type ReplayAction } from '../../battle';
import { UnitGroup } from '../../types';
import { COMBAT_RULES_VERSION } from './actions';

const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const text = (v: unknown, max = 100) => typeof v === 'string' && v.length > 0 && v.length <= max;
const units = Object.values(UnitGroup);
const kit = (v: any) => record(v) && finite(v.hp,1,100000) && finite(v.dps,0,10000) && finite(v.speed,0,100) && finite(v.range,0,100);
const asset = (v: unknown) => typeof v === 'string' && /^\/assets\/[\w./-]+$/.test(v) && !v.includes('..');
const layout = (v: unknown) => Array.isArray(v) && v.length>0 && v.length<=256 && new Set(v.map(b=>b?.id)).size===v.length && v.every(b=>record(b)&&text(b.id)&&['hq','defense','building','wall'].includes(b.kind)&&finite(b.x,0,100)&&finite(b.y,0,100)&&finite(b.hp,1,1000000)&&finite(b.size,0.1,40)&&(b.art===undefined||asset(b.art))&&(b.damage===undefined||finite(b.damage,0,10000))&&(b.range===undefined||finite(b.range,0,100))&&(b.level===undefined||finite(b.level,1,100)));
const multiplier = (v: unknown) => v===undefined || (record(v) && Object.entries(v).every(([k,n])=>units.includes(k as UnitGroup)&&finite(n,0,100)));
const heroes = (v: unknown) => Array.isArray(v)&&v.length<=9&&new Set(v.map(h=>h?.key)).size===v.length&&v.every(h=>kit(h)&&HERO_DEFS.some(d=>d.key===h.key&&d.ability===h.ability)&&text(h.name)&&text(h.abilityName)&&asset(h.art)&&units.includes(h.unit));
const specials = (v: unknown) => Array.isArray(v)&&v.length<=2&&new Set(v.map(h=>h?.key)).size===v.length&&v.every(h=>kit(h)&&SPECIALS.some(d=>d.key===h.key)&&finite(h.count,1,40)&&finite(h.charges,1,10)&&asset(h.art)&&(h.aura===undefined||(record(h.aura)&&finite(h.aura.radius,0,100)&&finite(h.aura.keepRageT,0,20))));
const squad = (v: unknown, modern: boolean) => v===undefined || (Array.isArray(v)&&v.length<=150&&new Set(v.map(p=>p?.id)).size===v.length&&v.every(p=>record(p)&&text(p.id)&&text(p.name)&&text(p.role,30)&&units.includes(p.unit)&&(!modern||(record(p.stats)&&['strength','speed','iq'].every(k=>finite(p.stats[k],1,1000))&&finite(p.level,1,100)))));
const commands = (v: unknown, modern: boolean) => Array.isArray(v)&&v.length<=1500&&v.every((a,i)=>record(a)&&Number.isInteger(a.tick)&&finite(a.tick,0,1400)&&(i===0||a.tick>=v[i-1].tick)&&['t','h','s','p','a','e',...(modern?['d']:[])].includes(a.k)&&(['t','h','s','p'].includes(a.k)?finite(a.x,0,100)&&finite(a.y,0,100):true)&&(a.k!=='t'||units.includes(a.u))&&(!['h','a'].includes(a.k)||HERO_DEFS.some(h=>h.key===a.key))&&(a.k!=='s'||SPECIALS.some(s=>s.key===a.key))&&(a.k!=='p'||PLAYBOOK.some(p=>p.key===a.key))&&(a.k!=='d'||['noise','pkg','timeout'].includes(a.key)));

/** Untrusted film is bounded and checked before it can allocate or simulate anything.
 * This validates playback data; it does not authorize competitive rewards.
 */
export function validateReplay(value: unknown): ReplayData | null {
  try {
    const serialized=JSON.stringify(value);
    if (!serialized || serialized.length>450000) return null;
    const v=JSON.parse(serialized);
    if(!record(v)||![1,2].includes(v.v)||!Number.isInteger(v.seed)||!finite(v.seed,0,4294967295)||!GAME_PLANS.some(p=>p.key===v.plan)||!layout(v.layout)||!heroes(v.heroes)||!specials(v.specials)||!multiplier(v.power)||!squad(v.squad,v.v===2)||!commands(v.script,v.v===2)) return null;
    if(v.v===2) {
      if(v.script.some((a:ReplayAction)=>a.tick>v.ticks)) return null;
      const c=v.snapshot;
      if(!supportsCombatRules(v.rules)||!text(v.finalHash,8)||!/^[0-9a-f]{8}$/.test(v.finalHash)||!Number.isInteger(v.ticks)||!finite(v.ticks,0,1400)||!record(c)||!['attack','defense'].includes(c.mode)||!text(c.title,160)||c.replay!==undefined||!layout(c.buildings)||!heroes(c.heroes??[])||!specials(c.specials??[])||!squad(c.squad,true)||!multiplier(c.power)||!multiplier(c.preparation)||!multiplier(c.playerArmy)||!record(c.loot)||!finite(c.loot.coins,0,1000000)||!finite(c.loot.fans,0,1000000)) return null;
      if(c.authority?.rules!==undefined && c.authority.rules!==v.rules)return null;
      if(c.aiMult!==undefined&&!finite(c.aiMult,0.1,20))return null;
      if(c.fans!==undefined&&!finite(c.fans,0,100000000))return null;
      if(c.masteryTier!==undefined&&!finite(c.masteryTier,0,3))return null;
      if(c.homeGuards!==undefined&&(!Array.isArray(c.homeGuards)||c.homeGuards.length>80||!c.homeGuards.every((g:any)=>record(g)&&finite(g.hp,1,100000)&&finite(g.dps,0,10000)&&(g.x===undefined||finite(g.x,0,100))&&(g.y===undefined||finite(g.y,0,100))&&(g.art===undefined||asset(g.art))))) return null;
      const troops=(ts:any)=>Array.isArray(ts)&&ts.length<=150&&ts.every(t=>record(t)&&units.includes(t.unit)&&finite(t.x,0,100)&&finite(t.y,0,100));
      if(c.preTroops!==undefined&&!troops(c.preTroops))return null;
      if(c.gauntlet!==undefined&&(!record(c.gauntlet)||!finite(c.gauntlet.tier,1,20)||!Array.isArray(c.gauntlet.waves)||c.gauntlet.waves.length>10||!c.gauntlet.waves.every((w:any)=>record(w)&&finite(w.at,0,60)&&finite(w.mult,0.1,20)&&troops(w.troops))))return null;
      if(canonicalJson(v.layout)!==canonicalJson(c.buildings)||canonicalJson(v.heroes)!==canonicalJson(c.heroes??[])||canonicalJson(v.specials)!==canonicalJson(c.specials??[])||canonicalJson(v.squad??[])!==canonicalJson(c.squad??[])) return null;
    }
    return v as ReplayData;
  } catch { return null; }
}

export const replayCommand = (command: Omit<ReplayAction,'tick'>, tick:number): ReplayAction => ({...command,tick});
