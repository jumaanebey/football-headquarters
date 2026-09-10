import type { DefenseLogEntry } from '../types';

/** Exact ID format emitted by the retired load-time AI raid generator. Keep
 * those saved rows, but do not present them as attacks from another player. */
export const isArchivedAiRaid = (entry: DefenseLogEntry): boolean =>
  !entry.attackerPid && !entry.replay && typeof entry.id === 'string' && /^def_\d+_\d+$/.test(entry.id);

export const defenseHistoryLabel = (entry: DefenseLogEntry): string =>
  isArchivedAiRaid(entry) ? 'Archived AI simulation' : entry.attackerPid || (typeof entry.id === 'string' && entry.id.startsWith('pvp_')) ? 'Rival attack' : 'Saved result';
