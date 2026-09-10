import { trackFunnel, type FunnelStep } from './funnel';
import { playerId } from '../pvp';
/** Scope observations to the active account; never put identity in event properties. */
export function productFunnel(step: FunnelStep, props: Record<string, unknown> = {}, owner = playerId() ?? 'local') {
  try {
    const prefix = `fhq_product:${owner}:`;
    return trackFunnel(step, props, { storage: { getItem: key => localStorage.getItem(prefix + key), setItem: (key, value) => localStorage.setItem(prefix + key, value) } });
  } catch { return false; }
}
export function observeVisit(owner: string, installed: boolean, returning: boolean, source: string) {
  const key = `fhq_first_seen:${owner}`;
  try {
    const now = Date.now(), first = Number(localStorage.getItem(key)) || now;
    localStorage.setItem(key, String(first));
    productFunnel('visible_start', { installed, returning, source }, owner);
    if (new Date(first).toISOString().slice(0,10) !== new Date(now).toISOString().slice(0,10)) productFunnel('return_visit', { installed, daysSinceFirst: Math.floor((now-first)/86400000) }, owner);
  } catch { /* Observation cannot block play. */ }
}

/** Persist the last observed levels so completion while the app is closed is still counted. */
export function observeGrowth(owner: string, levels: Record<string, number>, protectedClub: boolean) {
  try {
    const key = `fhq_growth:${owner}`;
    const raw = localStorage.getItem(key);
    const before = raw ? JSON.parse(raw) : null;
    if (before && typeof before === 'object') {
      for (const [kind, level] of Object.entries(levels)) {
        if (Number.isFinite(before[kind]) && level > before[kind]) productFunnel('upgrade_meaningful', {kind: kind === 'stadium' ? 'stadium' : 'hero', toLevel: level, protected: protectedClub}, owner);
      }
    }
    localStorage.setItem(key, JSON.stringify(levels));
  } catch { /* Observation cannot block play. */ }
}
