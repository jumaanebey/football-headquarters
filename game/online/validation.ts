import type { BattleBuildingDef } from '../../battle';
import { jsonBytes } from './cloudStore';
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const finiteWithin = (value: unknown, lo: number, hi: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;
export const isPlayerId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const validName = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 40;
export const validLayout = (value: unknown): value is BattleBuildingDef[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 150 || jsonBytes(value) >= 60_000) return false;
  const ids = new Set<string>(); let hq = 0;
  for (const row of value) {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id || row.id.length > 80 || ids.has(row.id)) return false;
    ids.add(row.id);
    if (!['hq', 'defense', 'building', 'wall'].includes(String(row.kind)) || !finiteWithin(row.x, 0, 100) || !finiteWithin(row.y, 0, 100)
      || !finiteWithin(row.hp, 1, 10_000_000) || !finiteWithin(row.size, 0.1, 30)) return false;
    if (row.kind === 'hq') hq++;
    if (row.damage !== undefined && !finiteWithin(row.damage, 0, 100_000)) return false;
    if (row.range !== undefined && !finiteWithin(row.range, 0, 150)) return false;
    if (row.level !== undefined && (!Number.isInteger(row.level) || !finiteWithin(row.level, 1, 20))) return false;
    if (row.flavor !== undefined && !['jugs', 'sled', 'ref', 'tshirt', 'cooler'].includes(String(row.flavor))) return false;
    if (row.formation !== undefined && (typeof row.formation !== 'string' || row.formation.length > 50)) return false;
    // Published art must be an asset in this game; remote URLs are never loaded.
    if (row.art !== undefined && (typeof row.art !== 'string' || !/^\/assets\/[a-z0-9_/-]+\.(webp|png)$/i.test(row.art) || row.art.includes('..'))) return false;
  }
  return hq === 1;
};
export const validLeader = (value: unknown): value is { pid: string; name: string; trophies: number } =>
  isRecord(value) && isPlayerId(value.pid) && validName(value.name) && finiteWithin(value.trophies, 0, 20_000) && Number.isInteger(value.trophies);
export const validLiveBase = (value: unknown): value is { pid: string; name: string; trophies: number; layout: BattleBuildingDef[] } =>
  validLeader(value) && validLayout((value as unknown as Record<string, unknown>).layout);
export const validAttack = (value: unknown): value is { id: number; attacker_name: string; attacker_pid?: string; stars: number; pct: number; coins_lost: number; created_at: string; replay?: unknown } =>
  isRecord(value) && Number.isSafeInteger(value.id) && finiteWithin(value.id, 1, Number.MAX_SAFE_INTEGER) && validName(value.attacker_name)
  && (value.attacker_pid === undefined || value.attacker_pid === null || isPlayerId(value.attacker_pid))
  && Number.isInteger(value.stars) && finiteWithin(value.stars, 0, 3) && finiteWithin(value.pct, 0, 100)
  && Number.isInteger(value.coins_lost) && finiteWithin(value.coins_lost, 0, 100_000)
  && typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
