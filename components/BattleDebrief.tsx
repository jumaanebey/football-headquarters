import React from 'react';
import { Flag, Trophy, Heart, Shield } from 'lucide-react';
import { gauntletReward, GAME_PLANS, type BBuilding, type BTroop, type GamePlanKey } from '../battle';
import { FORMATIONS, type FormationKey } from '../fixedBase';
import type { BattleConfig, BattleResult } from '../game/combat/contracts';
import { battleContributions, contributionLeaders, resultPresentation } from '../game/battleDebrief';
import { HeroArt } from './HeroArt';
import { Sheet } from './ui';

const METRICS = {
  yardage: { title: 'Yardage leader', unit: 'yards gained', color: 'text-amber-300', icon: Trophy },
  recovery: { title: 'Recovery leader', unit: 'grit recovered', color: 'text-emerald-300', icon: Heart },
  protection: { title: 'Protection leader', unit: 'pressure blocked', color: 'text-sky-300', icon: Shield },
};
const number = (value: number) => Math.round(value).toLocaleString();

export function BattleDebrief({ config, result, actors, buildings = [], guards = [], planKey, stats, modernCombat, replayVerified, onContinue, onPracticeAgain }: {
  config: BattleConfig; result: BattleResult; actors: BTroop[];
  buildings?: BBuilding[]; guards?: BTroop[]; planKey?: GamePlanKey;
  stats: { pancakes: number; lost: number; bonus: number } | null;
  modernCombat: boolean; replayVerified: boolean; onContinue: () => void; onPracticeAgain?: () => void;
}) {
  const { viewerWon, headline, eyebrow } = resultPresentation(config, result);
  const replay = !!config.replay;
  const defense = config.mode === 'defense';
  const neutral = config.practice || replay;
  const contributions = battleContributions(actors, config.heroes ?? []);
  const leaders = contributionLeaders(contributions);
  const formationKey = config.defenseFormation ?? config.buildings.find(b => b.kind === 'hq')?.formation;
  const formation = FORMATIONS[formationKey as FormationKey];
  const selectedPlan = GAME_PLANS.find(p => p.key === planKey);
  const showContributions = modernCombat && !defense;
  const purse = result.gauntletTier !== undefined
    ? gauntletReward(result.gauntletTier, result.wavesHeld ?? 0, !!result.gauntletCleared) : null;
  const primary = 'w-full min-h-12 rounded-xl bg-orange-500 px-4 py-3 text-base font-bold text-white hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
  return <div onKeyDown={event => event.stopPropagation()}>
    <Sheet title={headline} icon={<Flag className={neutral ? 'text-sky-300' : viewerWon ? 'text-emerald-300' : 'text-rose-300'} size={22} />}
      subtitle={eyebrow} onClose={onContinue} maxWidth="max-w-md"
      footer={<div className="space-y-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {config.practice && onPracticeAgain && <button type="button" onClick={onPracticeAgain} className={primary}>Practice again · Free</button>}
        <button type="button" onClick={onContinue} className={config.practice && onPracticeAgain
          ? 'w-full min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800'
          : primary}>
          {replay ? 'Close replay' : config.practice ? 'Back to Hero Film Room' : defense ? 'Back to base' : 'Collect rewards'}
        </button>
      </div>}>
      <div className="space-y-5 p-4 sm:p-5">
        <div className={`rounded-2xl border p-4 ${neutral ? 'border-sky-900 bg-sky-950/40' : viewerWon ? 'border-emerald-900 bg-emerald-950/40' : 'border-rose-900 bg-rose-950/40'}`}>
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm text-slate-300">{result.gauntletTier !== undefined ? 'Waves held' : replay ? 'Attacker’s Game Balls' : 'Game Balls'}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{result.gauntletTier !== undefined ? `${result.wavesHeld ?? 0} / 5` : `${result.stars} / 3`}</p></div>
            <div className="text-right"><p className="text-sm text-slate-300">{config.practice ? 'Targets cleared' : defense || replay ? 'Your base sacked' : 'Rival base sacked'}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{result.pct}%</p></div>
          </div>
          {config.practice && <p className="mt-3 text-sm text-sky-200">Free practice. Your club, energy and rewards stay unchanged.</p>}
          {replay && <p className="mt-3 text-sm text-sky-200">Recorded result. Watching this film does not change your club or award rewards.</p>}
        </div>

        <section aria-label="Game breakdown" className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
          <h3 className="font-bold text-white">How this result happened</h3>
          <p className="mt-2">{defense ? `Your defense ${result.pct < 50 ? 'kept damage below' : 'allowed damage to reach'} the 50% threshold. You hold the field by staying below 50%.` : 'Game balls: 50% overall damage, taking the Stadium, and 99% damage. Any one wins an attack.'}</p>
          <p className="mt-2">Targets cleared: {buildings.filter(b => b.kind !== 'wall' && b.dead).length} · Stadium {buildings.find(b => b.kind === 'hq')?.dead ? 'taken' : 'standing'}. Partial damage counts; walls do not.</p>
          {formation && <p className="mt-2">Defending formation: <b className="text-white">{formation.name}</b>.</p>}
          {!defense && selectedPlan && <p className="mt-2">Your plan: <b className="text-white">{selectedPlan.name}</b>. {formation?.counter.weakTo.includes(selectedPlan.key) ? 'This plan exploited the formation’s weakness.' : formation?.counter.strongVs.includes(selectedPlan.key) ? 'The formation countered this plan. Try its vulnerable plan before your next kickoff.' : 'The formation matchup was neutral.'}</p>}
          {defense && <p className="mt-2">{guards.filter(g => !g.dead).length}/{guards.length} defenders still on the field · {buildings.filter(b => b.kind === 'defense' && !b.dead).length} emplacements standing.</p>}
          {defense && <p className="mt-2">Next test: adjust one gate assignment or placement, then compare damage and surviving defenses against this result.</p>}
        </section>

        {config.campaignStage === 1 && !neutral && !defense && <section aria-label="Your next improvement" className="rounded-xl border border-orange-800 bg-orange-950/30 p-3 text-sm text-slate-200">
          <h3 className="font-bold text-orange-300">Next: improve your club</h3>
          <p className="mt-1">{result.won ? 'You cleared the opener. ' : 'You can retry the opener after preparing. '}Back home, open Heroes to compare a Train upgrade’s cost and stat benefit. If you need Coins, use the Training Field drills. Game Day shows your next match.</p>
          <p className="mt-2 text-xs text-slate-300">Readiness is a preparation bonus, not a requirement to play. Free hero practice is always available.</p>
        </section>}

        {showContributions && <section aria-label={config.practice ? 'Practice contributions' : replay ? 'Attacking contributions' : 'Drive contributions'}>
          <h3 className="mb-3 font-display text-base font-bold text-white">{replay ? 'The attacking team’s standouts' : 'Your team’s standouts'}</h3>
          <div className="space-y-2">
            {leaders.map(({ metric, actor, amount }) => {
              const label = METRICS[metric]; const Icon = label.icon;
              return <div key={metric} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                {actor.heroKey && actor.art ? <HeroArt heroKey={actor.heroKey} art={actor.art} className="h-16 w-16 shrink-0" />
                  : <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 ${label.color}`}><Icon size={24} aria-hidden="true" /></span>}
                <div className="min-w-0"><p className={`text-sm ${label.color}`}>{label.title}</p><p className="break-words text-base font-bold text-white">{actor.name}</p>
                  <p className="text-sm text-slate-300"><span className="font-bold tabular-nums text-white">{number(amount)}</span> {label.unit}</p></div>
              </div>;
            })}
            {!leaders.length && <p className="text-sm text-slate-400">No yardage, recovery or protection was recorded this drive.</p>}
          </div>
          {contributions.length > 0 && <details className="mt-3 rounded-xl border border-slate-700">
            <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-bold text-white">All player stats ({contributions.length})</summary>
            <div className="space-y-3 border-t border-slate-700 p-3">{contributions.map(actor => <div key={actor.id}>
              <p className="mb-1 break-words text-sm font-bold text-white">{actor.name}</p>
              <dl className="grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-400">Yards</dt><dd className="font-bold tabular-nums text-amber-300">{number(actor.yardage)}</dd></div>
                <div><dt className="text-slate-400">Recovered</dt><dd className="font-bold tabular-nums text-emerald-300">{number(actor.recovery)}</dd></div>
                <div><dt className="text-slate-400">Blocked</dt><dd className="font-bold tabular-nums text-sky-300">{number(actor.protection)}</dd></div></dl>
            </div>)}</div>
          </details>}
        </section>}

        {stats && !defense && <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-400">{replay ? 'Home defenders stopped' : 'Defenders stopped'}</dt><dd className="font-bold text-white">{stats.pancakes}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-400">{replay ? 'Attackers subbed out' : 'Players subbed out'}</dt><dd className="font-bold text-white">{stats.lost}</dd></div>
        </dl>}
        {!neutral && <dl className="space-y-2 rounded-xl bg-slate-900 p-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-300">{purse ? 'Night purse' : defense ? 'Coins lost' : 'Coins won'}</dt><dd className={`font-bold tabular-nums ${defense && !purse ? 'text-rose-300' : 'text-amber-300'}`}>{defense && !purse ? '−' : '+'}{number(purse?.coins ?? result.coins)}</dd></div>
          {(!defense || purse) && <div className="flex justify-between gap-4"><dt className="text-slate-300">New fans won over</dt><dd className="font-bold tabular-nums text-rose-300">+{number(purse?.fans ?? result.fans)}</dd></div>}
        </dl>}
        {!neutral && !defense && config.rival && <figure className="flex items-center gap-3 border-t border-slate-800 pt-4">
          <img src={config.rival.art} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <div className="min-w-0"><blockquote className="text-sm italic text-slate-300">“{result.won ? config.rival.win : config.rival.loss}”</blockquote>
            <figcaption className="mt-1 text-xs text-slate-400">{config.rival.name}</figcaption></div>
        </figure>}
        {replay && modernCombat && <p role="status" className="text-sm text-slate-300">{replayVerified ? 'Replay matches the recorded drive.' : 'Replay could not be verified against the recording.'}</p>}
      </div>
    </Sheet>
  </div>;
}
