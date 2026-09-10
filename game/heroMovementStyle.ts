/** Cosmetic footfall/idle personality, derived from the presentation profiles so there is one
 * source of truth (game/heroPresentation.ts). Movement distance and combat timing remain owned by
 * the simulation; these values only choose how a pose is presented. */
import { HERO_PRESENTATION } from './heroPresentation';
export const HERO_MOVEMENT_STYLE: Record<string, { lift: number; breath: number }> = Object.fromEntries(Object.entries(HERO_PRESENTATION).map(([key, p]) => [key, { lift: p.lift, breath: p.idle.breathSeconds }]));
