/** Cosmetic footfall/idle personality. Movement distance and combat timing remain
 * owned by the simulation; these values only choose how a pose is presented. */
export const HERO_MOVEMENT_STYLE: Record<string, { lift: number; breath: number }> = {
  qb: { lift: 4, breath: 2.8 },
  enforcer: { lift: 2, breath: 3.4 },
  coach: { lift: 1, breath: 3.6 },
  kicker: { lift: 4, breath: 3.1 },
  burner: { lift: 7, breath: 2.1 },
  medic: { lift: 2, breath: 2.9 },
  captain: { lift: 1, breath: 3.8 },
  playmaker: { lift: 5, breath: 2.5 },
  legend: { lift: 2, breath: 4.2 },
};
