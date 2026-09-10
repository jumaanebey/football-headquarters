// Stable product funnel for Football Headquarters. One event name per milestone, emitted at most
// once per player per milestone (per day for return_visit, per match for result), with a small
// allow-listed props bag — never tokens, emails, club names or club state. Analytics is
// observational: receipts and the authority remain the only source of truth for rewards.
//
// Existing events (session_start, club_created, battle_result, battle_confirmed,
// building_upgrade, …) keep flowing unchanged; the funnel events are additional, prefixed
// `funnel_`, so the weekly report can count milestones without re-deriving them from
// event-specific props. Codex wires `trackFunnel` at the UI milestones listed in
// docs/PERF-INSTALL-MILESTONE.md.
import { track } from '../analytics';

export const FUNNEL_STEPS = [
  { step: 'visible_start', label: 'Game visible', once: 'ever' },
  { step: 'naming_complete', label: 'Named the club', once: 'ever' },
  { step: 'tutorial_complete', label: 'Finished the tutorial', once: 'ever' },
  { step: 'first_kickoff', label: 'Kicked off a first game', once: 'ever' },
  { step: 'result', label: 'Saw a result', once: 'per-match' },
  { step: 'confirmed_reward', label: 'Reward confirmed', once: 'per-match' },
  { step: 'upgrade_meaningful', label: 'Meaningful upgrade', once: 'ever' },
  { step: 'backup_prompt_viewed', label: 'Backup prompt viewed', once: 'ever' },
  { step: 'backup_completed', label: 'Backup completed', once: 'ever' },
  { step: 'return_visit', label: 'Returned another day', once: 'per-day' },
] as const;
export type FunnelStep = typeof FUNNEL_STEPS[number]['step'];
export const funnelEventName = (step: FunnelStep) => `funnel_${step}`;

/** Allow-listed props per step. Anything else is dropped before emission. */
const ALLOWED: Record<FunnelStep, readonly string[]> = {
  visible_start: ['returning', 'installed', 'source'],
  naming_complete: ['nameLen'],
  tutorial_complete: ['choice'],
  first_kickoff: ['mode', 'protected'],
  result: ['matchId', 'mode', 'won', 'stars', 'protected'],
  confirmed_reward: ['matchId', 'mode', 'won'],
  upgrade_meaningful: ['kind', 'toLevel', 'protected'],
  backup_prompt_viewed: ['reason'],
  backup_completed: ['method'],
  return_visit: ['daysSinceFirst', 'installed'],
};
const SCALAR = (v: unknown) => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 40 && !/[@\s]/.test(v));
const KEY = 'fhq_funnel_v1';
type Storage2 = Pick<Storage, 'getItem' | 'setItem'>;
const load = (storage: Storage2 | null): Record<string, string> => { try { const raw = storage?.getItem(KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const save = (storage: Storage2 | null, seen: Record<string, string>) => { try { storage?.setItem(KEY, JSON.stringify(seen)); } catch { /* best effort: at worst a milestone repeats after a storage failure */ } };
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface FunnelOptions { storage?: Storage2 | null; now?: () => number; emit?: typeof track }

/** Emit a funnel milestone once. Returns true when an event was sent, false when deduplicated or the step is unknown. */
export function trackFunnel(step: FunnelStep, props: Record<string, unknown> = {}, options: FunnelOptions = {}): boolean {
  const def = FUNNEL_STEPS.find(s => s.step === step);
  if (!def) return false;
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const now = options.now?.() ?? Date.now();
  const seen = load(storage);
  const marker = def.once === 'ever' ? '1' : def.once === 'per-day' ? dayKey(now) : String(props.matchId ?? '');
  if (def.once === 'per-match' && !marker) return false; // a per-match milestone without a match id cannot be deduplicated: refuse rather than double count
  const slot = def.once === 'per-match' ? `${step}:${marker}` : step;
  if (seen[slot] === marker || (def.once === 'per-match' && slot in seen)) return false;
  const clean: Record<string, unknown> = {};
  for (const k of ALLOWED[step]) if (k in props && SCALAR(props[k])) clean[k] = props[k];
  (options.emit ?? track)(funnelEventName(step), clean);
  seen[slot] = marker;
  // Keep the per-match slots bounded.
  const matchSlots = Object.keys(seen).filter(k => k.includes(':'));
  for (const k of matchSlots.slice(0, Math.max(0, matchSlots.length - 60))) delete seen[k];
  save(storage, seen);
  return true;
}
/** Test hook. */
export const FUNNEL_STORAGE_KEY = KEY;
