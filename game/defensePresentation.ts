/** Presentation of current rules. No hidden role multipliers or simulation changes. */
export const DEFENSE_MATCHUPS: Record<string,{action:string;strong:string;counter:string}> = {
  jugs:{action:'Rapid single-target pressure',strong:'Punishes unprotected low-Grit skill players.',counter:'Lead with a durable blocker to absorb the stream.'},
  sled:{action:'Close-range padded impact',strong:'Punishes runners that enter its short reach.',counter:'QB and kicker range can keep them outside the hit zone.'},
  ref:{action:'Flag and whistle · movement slow',strong:'Interrupts fast runners crossing open lanes.',counter:'Use ranged support; avoid sending a lone speed player through its coverage.'},
  tshirt:{action:'T-shirt burst · area hit and slow',strong:'Catches tightly grouped offensive players.',counter:'Split deployments across lanes instead of stacking the whole squad.'},
  cooler:{action:'Water spray · slowing puddle',strong:'Delays every player crossing the wet lane.',counter:'Approach from another side; a fast player also slows in the puddle.'},
};
