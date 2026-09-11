import { GameState, Player, PlayerState } from '../types';
import { TENDENCIES, TendencyKey } from '../constants';
import { freshDailies, todayKey } from '../dailies';
import { mulberry32 } from '../battle';
import { advanceEconomy } from './economy';
import {advanceScouting} from './scouting';
import { advanceDevelopment } from './development';
import { fanMilestoneTotal } from './fanProgress';

/** Advance wall-clock economy and timers, with bounded visual movement on resume.
 * No browser access, mutation, timers, sound, or random global state in this transition.
 * React can replay it without duplicating events or changing patrol destinations.
 */
/** `calendarDate` overrides the local calendar day: protected clubs advance on the club server's UTC day. */
export function advanceCampus(previous: GameState, now: number, calendarDate?: string, settleActivities = true): GameState {
  if (!Number.isFinite(now) || now <= previous.lastTick) return previous;
  const seconds = (now - previous.lastTick) / 1000;
  const movementSeconds = Math.min(seconds, 0.25);
  const random = mulberry32(Math.floor(now));
  const patrolPoint = (player: Player) => {
    const angle = Math.atan2(player.worldPos.y - 55, player.worldPos.x - 55) + 0.45 + random() * 0.5;
    const radius = 20 + random() * 5;
    return { x: Math.min(94, Math.max(6, 55 + Math.cos(angle) * radius)), y: Math.min(94, Math.max(6, 55 + Math.sin(angle) * radius)), z: 0 };
  };
  const economy = advanceEconomy(previous, now);
  const roster = previous.roster.map(player => {
    if (player.state === PlayerState.IDLE && TENDENCIES[player.tendency as TendencyKey]?.side === 'defense') {
      return { ...player, state: PlayerState.PATROLLING, targetPos: patrolPoint(player) };
    }
    const dx = player.targetPos.x - player.worldPos.x, dy = player.targetPos.y - player.worldPos.y;
    const distance = Math.hypot(dx, dy);
    const patrolling = player.state === PlayerState.PATROLLING;
    const step = (patrolling ? 6.5 : 15) * movementSeconds;
    if (distance > 0.5 && distance > step) {
      return { ...player, worldPos: { x: player.worldPos.x + dx / distance * step, y: player.worldPos.y + dy / distance * step, z: 0 }, state: player.targetPos.z === 1 ? PlayerState.TRAINING : patrolling ? PlayerState.PATROLLING : PlayerState.WALKING };
    }
    // Snap on arrival. An unconstrained step previously overshot the destination,
    // especially after tab suspension, sending players back and forth indefinitely.
    const arrived = distance > 0 ? { ...player, worldPos: { x: player.targetPos.x, y: player.targetPos.y, z: 0 } } : player;
    if (patrolling) return { ...arrived, targetPos: patrolPoint(arrived) };
    if (player.state === PlayerState.WALKING || (player.state === PlayerState.TRAINING && player.targetPos.z !== 1)) {
      return { ...arrived, state: player.targetPos.z === 1 ? PlayerState.TRAINING : PlayerState.IDLE };
    }
    return arrived;
  });
  const date = calendarDate ?? todayKey(now);
  const advanced = {
    ...previous, ...economy, roster, peakFans: fanMilestoneTotal(previous),
    dailies: previous.dailies.date === date ? previous.dailies : freshDailies(date),
    gauntlet: previous.gauntlet.date === date ? previous.gauntlet : { ...previous.gauntlet, attempts: 3, date },
    timeOfDay: (previous.timeOfDay + seconds / 60 * 24) % 24,
    lastTick: now,
  };
  return settleActivities?advanceScouting(advanceDevelopment(advanced,now,calendarDate!==undefined),now,calendarDate!==undefined):advanced;
}
