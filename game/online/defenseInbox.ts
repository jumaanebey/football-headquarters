import { ResourceType, type DefenseLogEntry, type GameState } from '../../types';
import { trophiesLostOnDefense } from '../../ranks';
import type { AttackCursor, AttackInbox } from '../../pvp';
import { isPlayerId, validAttack } from './validation';
const EPOCH = new Date(0).toISOString();
const compare = (a: AttackCursor, b: AttackCursor): number => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id;
export const defenseCursor = (state: GameState, ownerId: string): AttackCursor => {
  if (state.defenseInbox?.ownerId === ownerId) return { createdAt: state.defenseInbox.createdAt, id: state.defenseInbox.id };
  return { createdAt: EPOCH, id: 0 };
};
/** Old unowned watermarks and trimmed defense logs cannot prove which historical
 * losses were already applied. Establish a current server baseline with NO losses. */
export const establishDefenseInbox = (state: GameState, ownerId: string, cursor: AttackCursor): GameState => {
  if (state.defenseInbox?.ownerId === ownerId || !isPlayerId(ownerId) || !Number.isSafeInteger(cursor.id) || cursor.id < 0 || !Number.isFinite(Date.parse(cursor.createdAt))) return state;
  return { ...state, defenseInbox: { ownerId, ...cursor } };
};
/** Losses, log entries, and the inbox cursor become one save transaction. React's
 * functional setter may run this twice; the cursor makes repeated pages no-ops. */
export const applyAttackInbox = (state: GameState, page: AttackInbox, expectedOwnerId: string): GameState => {
  if (state.defenseInbox?.ownerId !== expectedOwnerId || page.status !== 'ok' || !isPlayerId(expectedOwnerId) || page.playerId !== expectedOwnerId || page.attacks.length > 20
    || !page.attacks.every(validAttack) || !Number.isFinite(Date.parse(page.cursor.createdAt)) || !Number.isSafeInteger(page.cursor.id) || page.cursor.id < 0) return state;
  const current = defenseCursor(state, expectedOwnerId);
  if (compare(page.cursor, current) <= 0) return state;
  const rows = [...page.attacks].sort((a, b) => compare({ createdAt: a.created_at, id: a.id }, { createdAt: b.created_at, id: b.id }));
  const last = rows[rows.length - 1];
  // Never accept a cursor beyond the records that were actually received.
  if (!last || compare(page.cursor, { createdAt: last.created_at, id: last.id }) !== 0) return state;
  const seen = new Set(state.defenseLog.map(row => row.id));
  const fresh = rows.filter(row => {
    const key = `pvp_${row.id}`;
    if (compare({ createdAt: row.created_at, id: row.id }, current) <= 0 || seen.has(key)) return false;
    seen.add(key); return true;
  });
  let coins = state.resources.COINS, trophies = state.trophies;
  const entries: DefenseLogEntry[] = fresh.map(row => {
    const coinsLost = Math.min(row.coins_lost, Math.round(coins * 0.12), coins);
    coins -= coinsLost;
    trophies = Math.max(0, trophies + trophiesLostOnDefense(row.pct));
    return { id: `pvp_${row.id}`, attacker: `${row.attacker_name} ⚡`, at: Date.parse(row.created_at), stars: row.stars,
      pct: row.pct, coinsLost, seen: false, replay: row.replay ?? undefined, attackerPid: row.attacker_pid ?? undefined };
  });
  const holds = fresh.filter(row => row.stars === 0).length;
  const defenseLog = [...entries.reverse(), ...state.defenseLog].slice(0, 20).map((row, index) => index < 5 || !row.replay ? row : { ...row, replay: undefined });
  return { ...state, resources: { ...state.resources, [ResourceType.COINS]: coins }, trophies, defenseLog,
    formationMastery: holds ? { ...state.formationMastery, [state.formation]: (state.formationMastery[state.formation] ?? 0) + holds } : state.formationMastery,
    defenseInbox: { ownerId: expectedOwnerId, ...page.cursor } };
};
