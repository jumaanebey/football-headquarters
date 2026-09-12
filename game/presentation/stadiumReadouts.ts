import {describeYard,fieldGoalDistance,kickerOf,yardsToGoal,type FootballActor,type StadiumFootballGame} from '../stadiumFootball';
/** Older receipts contain lineup means for these attributes, not personal player stats. */
export function actorReadout(actor:FootballActor):string{
 return actor.attribute==='overall'?`${actor.name} · ${actor.role} · overall ${actor.value}`:
 `${actor.name} · ${actor.role} · lineup ${actor.attribute.toUpperCase()} average ${actor.value}`;
}
export function fieldPositionReadout(game:StadiumFootballGame):string{
 const away=game.possession==='away',distance=yardsToGoal(game.possession??'home',game.yardLine);
 return away?`They are ${distance} yards from your endzone, at ${describeYard(game.yardLine)}.`:
 `You are ${distance} yards from their endzone, at ${describeYard(game.yardLine)}.`;
}
/** v2's existing kick formula, displayed without changing the saved contract or result. */
export function kickOutlook(game:StadiumFootballGame):string{
 const distance=fieldGoalDistance(game.possession??'home',game.yardLine);
 const steadiness=kickerOf(game)?.power??Math.round(game.ratings.iq*3);
 const chance=Math.max(.03,Math.min(.97,.97-(distance-20)*.017+(steadiness-30)*.004));
 return `${Math.round(chance*100)}% estimated chance · ${chance<.2?'Very long shot':chance<.5?'Risky attempt':'Three points if good'}.`;
}
