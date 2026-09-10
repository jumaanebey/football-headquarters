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
  return <Sheet title="Prepare your game" subtitle={config.title} onClose={onClose}
    footer={<div className="space-y-2"><p className="text-sm text-slate-300">{energy} Energy available · {cost} to reserve this game</p>
      <Btn disabled={energy < cost} onClick={onStart}>Reserve game · {cost} Energy</Btn><Btn variant="secondary" onClick={onClose}>Back to club</Btn></div>}>
    <div className="space-y-5 p-4">
      <section className="rounded-xl border border-slate-700 p-4"><h3 className="font-bold text-white">Scout the defense</h3>
        <p className="mt-2 text-sky-200">{formation?.name ?? 'Formation not available'} · {config.buildings.filter(b => b.kind !== 'wall').length} targets</p>
        <p className="mt-2 text-sm text-slate-300">Deploy from the outside. Protect your heroes with support players, then break through to the Stadium.</p>
        {config.pvpTarget && <p className="mt-2 text-xs text-slate-400">Rival preview. Reserving loads the current defense; check its formation again before deploying.</p>}
      </section>
      <fieldset className="space-y-2"><legend className="mb-2 font-bold text-white">Choose your game plan</legend>
        {GAME_PLANS.map(p => {
          const multiplier = formation?.counter.weakTo.includes(p.key) ? COUNTER_WEAK_MULT : formation?.counter.strongVs.includes(p.key) ? COUNTER_STRONG_MULT : 1;
          return <button key={p.key} type="button" aria-pressed={plan === p.key} onClick={() => onPlan(p.key)}
            className={`w-full rounded-xl border-2 p-3 text-left ${plan === p.key ? 'border-orange-400 bg-orange-950/40' : 'border-slate-700 bg-slate-900'}`}>
            <span className="block font-bold text-white">{p.name}</span><span className="block text-sm text-slate-300">{p.blurb}</span>
            <span className={`block mt-1 text-sm ${multiplier > 1 ? 'text-emerald-300' : multiplier < 1 ? 'text-rose-300' : 'text-slate-400'}`}>
              {multiplier > 1 ? 'Favorable matchup' : multiplier < 1 ? 'Their formation counters this plan' : 'Neutral formation matchup'}{multiplier !== 1 ? ` · ${Math.round((multiplier - 1) * 100)}% attack modifier` : ''}
            </span></button>;
        })}
      </fieldset>
      <section><h3 className="font-bold text-white">Available to deploy</h3><p className="mt-2 text-sm text-slate-300">{count} squad players · {config.heroes?.length ?? 0} heroes. Choose who enters and where during the game.</p>
        <p className="mt-3 text-sm font-bold text-white">Choose your opening hero</p>
        <div className="mt-2 space-y-2">{config.heroes?.map(h => <button type="button" key={h.key} aria-pressed={openingHero === h.key} onClick={() => onHero(h.key)} className={`w-full rounded-lg border-2 p-3 text-left text-sm text-white ${openingHero === h.key ? 'border-orange-400 bg-orange-950/40' : 'border-slate-700 bg-slate-800'}`}>{h.name}<span className="block text-slate-300">{h.abilityName}</span>{openingHero === h.key && <span className="block text-orange-300">Selected for your first deployment</span>}</button>)}</div>
        {!!config.squad?.length && <details className="mt-3 rounded-lg border border-slate-700 p-3 text-sm text-slate-300"><summary className="cursor-pointer py-2 font-bold text-white">Inspect available squad ({config.squad.length})</summary><ul className="space-y-2 pt-2">{config.squad.map(p => <li key={p.id}>{p.name} · {p.role}<span className="block text-xs">Strength {p.stats.strength} · Speed {p.stats.speed} · IQ {p.stats.iq}</span></li>)}</ul></details>}
      </section>
      <section className="rounded-xl bg-slate-800 p-4 text-sm text-slate-200"><h3 className="font-bold text-white">What earns the reward</h3>
        <p className="mt-2">Earn one game ball at 50% overall damage, one for taking the Stadium, and one at 99% damage. Walls do not count toward the percentage. Any game ball wins an attack.</p>
        <p className="mt-2">Listed target reward: {config.loot.coins.toLocaleString()} Coins and {config.loot.fans} Fans. First-clear bonuses and match bonuses are separate.</p>
        <p className="mt-2">Your plan can still be changed before your first deployment. Backing out here costs nothing.</p>
      </section>
    </div>
  </Sheet>;
}
