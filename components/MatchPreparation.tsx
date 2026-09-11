import {HeroArt} from './HeroArt';
import {MatchScoutBoard} from './MatchScoutBoard';
import { DefenseCounterGuide } from './DefenseCounterGuide';
import { GAME_PLANS, type GamePlanKey } from '../battle';
import { FORMATIONS, COUNTER_STRONG_MULT, COUNTER_WEAK_MULT, type FormationKey } from '../fixedBase';
import type { BattleConfig } from '../game/combat/contracts';
import { Sheet, Btn } from './ui';

export function MatchPreparation({ config, energy, cost, plan, openingHero, onHero, onPlan, onStart, onClose }: {
  config: BattleConfig; energy: number; cost: number; plan: GamePlanKey;
  openingHero?: string; onHero: (key: string) => void;
  onPlan: (plan: GamePlanKey) => void; onStart: () => void; onClose: () => void;
}) {
  const key = config.buildings.find(b => b.kind === 'hq')?.formation as FormationKey | undefined;
  const formation = key ? FORMATIONS[key] : undefined;
  const count = Object.values(config.playerArmy ?? {}).reduce((sum, n) => sum + n, 0);
  return <Sheet title="Prepare your raid" subtitle={config.title} onClose={onClose} maxWidth="max-w-5xl"
    footer={<div className="fhq-prep-footer"><div><strong>{config.loot.coins.toLocaleString()} Coins · {config.loot.fans} Fans</strong><small>Target loot · bonuses separate · {energy} Energy available</small></div><Btn disabled={energy<cost} onClick={onStart}>Reserve raid · {cost} Energy</Btn><Btn variant="secondary" onClick={onClose}>Back to club</Btn></div>}>
    <div className="fhq-match-prep">
      <section className="fhq-prep-scout"><div className="fhq-prep-section-title"><h3>{formation?.name??'Opponent defense'}</h3><span>{config.buildings.filter(b=>b.kind!=='wall').length} targets</span></div>
        <MatchScoutBoard buildings={config.buildings}/>
        {config.pvpTarget&&<p className="fhq-prep-note">Rival preview. Reservation loads the current defense; check again before deployment.</p>}
        <DefenseCounterGuide buildings={config.buildings} rules={config.authority?.rules}/>
      </section>
      <section className="fhq-prep-decisions">
        <fieldset><legend>1 · Choose your raid plan</legend><div className="fhq-prep-plans">{GAME_PLANS.map(p=>{
          const mult=formation?.counter.weakTo.includes(p.key)?COUNTER_WEAK_MULT:formation?.counter.strongVs.includes(p.key)?COUNTER_STRONG_MULT:1;
          return <button key={p.key} type="button" aria-pressed={plan===p.key} onClick={()=>onPlan(p.key)}><strong>{p.name}</strong><small>{p.blurb}</small><span data-matchup={mult>1?'good':mult<1?'bad':'neutral'}>{mult>1?`+${Math.round((mult-1)*100)}% matchup`:mult<1?`${Math.round((mult-1)*100)}% matchup`:'Neutral matchup'}</span></button>;
        })}</div></fieldset>
        <fieldset><legend>2 · Opening hero</legend><div className="fhq-prep-heroes">{config.heroes?.map(h=><button type="button" key={h.key} aria-label={`Open with ${h.name}`} aria-pressed={openingHero===h.key} onClick={()=>onHero(h.key)}><HeroArt heroKey={h.key} art={h.art} className="fhq-prep-hero-art"/><strong>{h.name.replace(/^The /,'')}</strong><small>{h.abilityName}</small></button>)}</div></fieldset>
        <p className="fhq-prep-note">{count} squad players · {config.heroes?.length??0} heroes available. Deploy blockers ahead of fragile heroes.</p>
        <div className="fhq-prep-objectives"><strong>Coach the raid live</strong><span>Send blockers first · Keep receivers near a QB · Call a target</span><small>Squad orders let you rally out of marked attacks, pressure equipment, or protect a deployed hero. Walls and buildings obstruct movement and passing lanes.</small></div>
        <div className="fhq-prep-objectives"><strong>One game ball wins</strong><span>50% damage · Take the Stadium · 99% damage</span><small>Each earns a ball. Walls do not count. Backing out costs nothing.</small></div>
        {!!config.squad?.length&&<details className="fhq-prep-squad"><summary>Available squad · {config.squad.length} players</summary><ul>{config.squad.map(p=><li key={p.id}>{p.name} · {p.role} · STR {p.stats.strength} / SPD {p.stats.speed} / IQ {p.stats.iq}</li>)}</ul></details>}
      </section>
    </div>
  </Sheet>;
}
