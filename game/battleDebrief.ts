import { TROOP_STATS, type BTroop, type RaidHero } from '../battle';
import type { BattleConfig, BattleResult } from './combat/contracts';

export type ContributionMetric = 'yardage' | 'recovery' | 'protection';
export type PostBattleDestination = 'heroes' | 'games' | 'defense' | 'share';
export type ActorContribution = {
  id: string; name: string; heroKey?: string; art?: string;
  yardage: number; recovery: number; protection: number;
};
const measured = (value?: number) => Number.isFinite(value) ? Math.max(0, value!) : 0;

/** Read the final actors without changing the recorded match or mixing unlike stats. */
export function battleContributions(actors: BTroop[], heroes: RaidHero[]): ActorContribution[] {
  return actors.map(actor => {
    const hero = actor.isHero ? heroes.find(item => item.key === actor.heroKey) : undefined;
    return {
      id: actor.id,
      name: hero?.name ?? (actor.isHero ? 'Hero' : actor.nameTag
        || (actor.special === 'mascot' ? 'The Mascot' : actor.special === 'fan' ? 'The Fan Mob'
          : `${actor.jersey ? `#${actor.jersey} ` : ''}${TROOP_STATS[actor.unit].label}`)),
      heroKey: actor.isHero ? actor.heroKey : undefined, art: hero?.art,
      yardage: measured(actor.dmg), recovery: measured(actor.healingDone), protection: measured(actor.protectionDone),
    };
  });
}

/** Each category has its own leader; zero contribution never earns an award. */
export function contributionLeaders(actors: ActorContribution[]) {
  return (['yardage', 'recovery', 'protection'] as const).flatMap(metric => {
    const best = actors.reduce<ActorContribution | undefined>((leader, actor) =>
      actor[metric] > (leader?.[metric] ?? 0) ? actor : leader, undefined);
    return best ? [{ metric, actor: best, amount: best[metric] }] : [];
  });
}

/** A recorded attack is watched by its defender. Keep the engine's outcome intact. */
export function resultPresentation(config: BattleConfig, result: BattleResult) {
  const replay = !!config.replay;
  const defense = config.mode === 'defense';
  const viewerWon = replay && !defense ? !result.won : result.won;
  const headline = replay ? (viewerWon ? 'Your defense held' : 'Your defense was beaten')
    : config.practice ? 'Practice complete'
    : result.gauntletTier !== undefined ? (result.gauntletCleared ? `Night ${result.gauntletTier} survived` : 'The house fell')
    : defense ? (viewerWon ? 'Goal-line stand!' : 'They scored!')
    : result.campaignStage === 12 && viewerWon ? 'League champions!' : viewerWon ? 'Crowd silenced!' : 'Shut out';
  return { viewerWon, headline, eyebrow: replay ? 'Recorded drive' : config.practice ? 'Free hero practice' : viewerWon ? 'You won' : 'You lost' };
}

/** Advice uses observed outcomes; it does not claim a single cause for a loss. */
export function nextBattleImprovement({ defense, won, countered, lost }: {defense:boolean;won:boolean;countered:boolean;lost:number}): {title:string;reason:string;destination:PostBattleDestination} {
  if(defense)return {title:'Review your home defense',reason:'Compare surviving equipment and gate assignments with the damage shown here. Change one placement before the next test.',destination:'defense'};
  if(countered)return {title:'Try a different game plan',reason:'The defending formation countered your selected plan. Compare the highlighted matchups before your next kickoff.',destination:'games'};
  if(!won&&lost>0)return {title:'Prepare your heroes',reason:`${lost} players were subbed out. Compare hero training benefits and practice sending blockers ahead of your damage dealers.`,destination:'heroes'};
  return won?{title:'Choose your next opponent',reason:'You earned a game ball. Scout the next layout and its equipment before committing Energy.',destination:'games'}:{title:'Revisit the opponent layout',reason:'A game ball requires 50% damage, the Stadium, or 99% damage. Try a different entry point and focus your opening squad.',destination:'games'};
}
