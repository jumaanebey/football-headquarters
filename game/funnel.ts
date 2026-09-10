// Stable product funnel for Football Headquarters. One event name per milestone, emitted at most
// once per player per milestone (per day for return_visit, per match for result and
// confirmed_reward, per method for backup_completed), with a small allow-listed props bag —
// never tokens, emails, club names or club state. Analytics is observational: receipts and the
// authority remain the only source of truth for rewards.
//
// Semantics the milestones must keep apart (tests/funnel.test.ts):
//   result            the player SAW a result screen            ≠  confirmed_reward  the authority CONFIRMED it (receipt)
//   upgrade_requested the player ASKED for an upgrade/training  ≠  upgrade_meaningful the upgrade COMPLETED (level reached)
//   backup_prompt_viewed the backup UI was SHOWN                ≠  backup_completed   a backup EXISTS — and `method` says which
//   backup_completed { method: 'export' }  a file left the device    ≠  { method: 'account' }  progress is on the cloud account
// Repeat renders, retried settlements and account switches must not double count: markers are
// stored per account (`accountId` option; guests share the legacy key) and per match/method.
//
// Existing events (session_start, club_created, battle_result, battle_confirmed,
// building_upgrade, …) keep flowing unchanged; the funnel events are additional, prefixed
// `funnel_`. Codex wires `trackFunnel` at the App.tsx call sites listed in docs/PWA-RELIABILITY.md.
import { track } from '../analytics';

export const FUNNEL_STEPS = [
  { step: 'visible_start', label: 'Game visible', once: 'ever' },
  { step: 'naming_complete', label: 'Named the club', once: 'ever' },
  { step: 'tutorial_complete', label: 'Finished the tutorial', once: 'ever' },
  { step: 'first_kickoff', label: 'Kicked off a first game', once: 'ever' },
  { step: 'result', label: 'Saw a result', once: 'per-match' },
  { step: 'confirmed_reward', label: 'Reward confirmed', once: 'per-match' },
  { step: 'upgrade_requested', label: 'Requested an upgrade', once: 'ever' },
  { step: 'upgrade_meaningful', label: 'Meaningful upgrade completed', once: 'ever' },
  { step: 'backup_prompt_viewed', label: 'Backup prompt viewed', once: 'ever' },
  { step: 'backup_completed', label: 'Backup completed', once: 'per-method' },
  { step: 'return_visit', label: 'Returned another day', once: 'per-day' },
] as const;
export type FunnelStep = typeof FUNNEL_STEPS[number]['step'];
export const funnelEventName = (step: FunnelStep) => `funnel_${step}`;
export const BACKUP_METHODS = ['export', 'account'] as const;
export type BackupMethod = typeof BACKUP_METHODS[number];

/** Allow-listed props per step. Anything else is dropped before emission. */
const ALLOWED: Record<FunnelStep, readonly string[]> = {
  visible_start: ['returning', 'installed', 'source'],
  naming_complete: ['nameLen'],
  tutorial_complete: ['choice'],
  first_kickoff: ['mode', 'protected'],
  result: ['matchId', 'mode', 'won', 'stars', 'protected'],
  confirmed_reward: ['matchId', 'mode', 'won'],
  upgrade_requested: ['kind', 'toLevel', 'protected'],
  upgrade_meaningful: ['kind', 'toLevel', 'protected'],
  backup_prompt_viewed: ['reason'],
  backup_completed: ['method'],
  return_visit: ['daysSinceFirst', 'installed'],
};
const SCALAR = (v: unknown) => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 40 && !/[@\s]/.test(v));
const KEY = 'fhq_funnel_v1';
/** Guests (no account) share the legacy key; each signed-in account gets its own marker set. */
export const funnelStorageKey = (accountId?: string | null): string => accountId ? `${KEY}:${accountId}` : KEY;
type Storage2 = Pick<Storage, 'getItem' | 'setItem'>;
const load = (storage: Storage2 | null, key: string): Record<string, string> => { try { const raw = storage?.getItem(key); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const save = (storage: Storage2 | null, key: string, seen: Record<string, string>) => { try { storage?.setItem(key, JSON.stringify(seen)); } catch { /* best effort: at worst a milestone repeats after a storage failure */ } };
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface FunnelOptions {
  storage?: Storage2 | null;
  now?: () => number;
  emit?: typeof track;
  /** Signed-in owner (playerId()); markers are scoped to it so an account switch neither repeats nor suppresses another account's milestones. */
  accountId?: string | null;
}

/**
 * Emit a funnel milestone once. Returns true when an event was sent, false when deduplicated,
 * the step is unknown, or a keyed step lacks its key (per-match without matchId, backup without a
 * valid method) — refusing is always preferred to double counting.
 */
export function trackFunnel(step: FunnelStep, props: Record<string, unknown> = {}, options: FunnelOptions = {}): boolean {
  const def = FUNNEL_STEPS.find(s => s.step === step);
  if (!def) return false;
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const now = options.now?.() ?? Date.now();
  const key = funnelStorageKey(options.accountId);
  const seen = load(storage, key);
  let marker: string, slot: string;
  switch (def.once) {
    case 'ever': marker = '1'; slot = step; break;
    case 'per-day': marker = dayKey(now); slot = step; break;
    case 'per-match': marker = String(props.matchId ?? ''); if (!marker) return false; slot = `${step}:${marker}`; break;
    case 'per-method': marker = String(props.method ?? ''); if (!(BACKUP_METHODS as readonly string[]).includes(marker)) return false; slot = `${step}:${marker}`; break;
  }
  if (slot in seen && (def.once !== 'per-day' || seen[slot] === marker)) return false;
  const clean: Record<string, unknown> = {};
  for (const k of ALLOWED[step]) if (k in props && SCALAR(props[k])) clean[k] = props[k];
  (options.emit ?? track)(funnelEventName(step), clean);
  seen[slot] = marker;
  // Keep the keyed slots bounded (oldest first).
  const keyed = Object.keys(seen).filter(k => k.startsWith('result:') || k.startsWith('confirmed_reward:'));
  for (const k of keyed.slice(0, Math.max(0, keyed.length - 60))) delete seen[k];
  save(storage, key, seen);
  return true;
}
/** Test hook. */
export const FUNNEL_STORAGE_KEY = KEY;
