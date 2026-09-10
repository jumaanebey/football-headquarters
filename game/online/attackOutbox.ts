import { jsonBytes } from './cloudStore';
import { finiteWithin, isPlayerId, isRecord, validName } from './validation';
export interface AttackPayload { target_pid: string; attacker_pid: string; attacker_name: string; stars: number; pct: number; coins_lost: number; replay: unknown }
export type AttackReportResult = { status: 'reported' | 'pending' | 'unconfirmed' | 'rejected'; operationId: string; message: string };
type ReportState = 'queued' | 'sending' | 'unconfirmed' | 'reported' | 'rejected';
interface Entry { id: string; payload: AttackPayload; state: ReportState; protocol: 'idempotent' | 'legacy' | null; at: number }
type OutboxStorage = Pick<Storage, 'getItem' | 'setItem'>;
type Request = (url: string, init?: RequestInit) => Promise<Response>;
const KEY = 'fhq_attack_outbox_v1';
const validPayload = (p: unknown): p is AttackPayload => isRecord(p) && isPlayerId(p.target_pid) && isPlayerId(p.attacker_pid)
  && p.target_pid !== p.attacker_pid && validName(p.attacker_name) && Number.isInteger(p.stars) && finiteWithin(p.stars, 0, 3)
  && finiteWithin(p.pct, 0, 100) && Number.isInteger(p.coins_lost) && finiteWithin(p.coins_lost, 0, 100_000) && jsonBytes(p.replay) < 75_000;
const result = (entry: Entry): AttackReportResult => {
  if (entry.state === 'reported') return { status: 'reported', operationId: entry.id, message: 'Raid report delivered. Scores are client-reported.' };
  if (entry.state === 'rejected') return { status: 'rejected', operationId: entry.id, message: 'The server did not accept this raid report.' };
  if (entry.state === 'unconfirmed' && entry.protocol === 'legacy') return { status: 'unconfirmed', operationId: entry.id, message: 'Report delivery could not be confirmed. It will not be resent because this server cannot prevent duplicates.' };
  return { status: 'pending', operationId: entry.id, message: 'Raid report is saved on this device and awaiting delivery.' };
};

/** An operation stays owned by its original account. Only servers with the unique
 * operation_id constraint can safely receive automatic retries after a lost reply. */
export class AttackOutbox {
  private entries: Entry[] = [];
  private loaded = false;
  private inflight = new Set<string>();
  private protocol: 'idempotent' | 'legacy' | null = null;
  constructor(private baseUrl: string, private request: Request, private storage: OutboxStorage) {}
  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const rows: unknown = JSON.parse(this.storage.getItem(KEY) ?? '[]');
      if (Array.isArray(rows)) this.entries = rows.filter((row): row is Entry => isRecord(row) && isPlayerId(row.id) && validPayload(row.payload)
        && ['queued', 'sending', 'unconfirmed', 'reported', 'rejected'].includes(String(row.state))
        && [null, 'legacy', 'idempotent'].includes(row.protocol as null | string) && Number.isFinite(row.at)).slice(-20);
      // The process may have stopped after the server accepted a request.
      this.entries = this.entries.map(row => row.state === 'sending' ? { ...row, state: 'unconfirmed' } : row);
    } catch { this.entries = []; }
  }
  private persist(): boolean {
    try { this.storage.setItem(KEY, JSON.stringify(this.entries)); return true; } catch { return false; }
  }
  list(uid: string): AttackReportResult[] { this.load(); return this.entries.filter(entry => entry.payload.attacker_pid === uid).map(result); }
  queue(id: string, payload: AttackPayload): AttackReportResult {
    this.load();
    if (!isPlayerId(id) || !validPayload(payload)) return { status: 'rejected', operationId: id, message: 'This raid report contains invalid data.' };
    const previous = this.entries.find(entry => entry.id === id);
    if (previous) return previous.payload.attacker_pid === payload.attacker_pid && JSON.stringify(previous.payload) === JSON.stringify(payload)
      ? result(previous) : { status: 'rejected', operationId: id, message: 'This report ID already belongs to another result.' };
    // Never evict a pending operation to silently pretend a new one was saved.
    this.entries = this.entries.filter(entry => !['reported', 'rejected'].includes(entry.state) || entry.at > Date.now() - 7 * 86400_000);
    if (this.entries.length >= 20) {
      const removable = this.entries.findIndex(entry => ['reported', 'rejected'].includes(entry.state));
      if (removable >= 0) this.entries.splice(removable, 1);
    }
    if (this.entries.length >= 20) return { status: 'rejected', operationId: id, message: 'This device has 20 undelivered raid reports. Reconnect before playing another live rival.' };
    const entry: Entry = { id, payload, state: 'queued', protocol: null, at: Date.now() };
    this.entries.push(entry);
    if (!this.persist()) { this.entries.pop(); return { status: 'rejected', operationId: id, message: 'This device could not save the report for delivery.' }; }
    return result(entry);
  }
  async send(id: string, uid: string, headers: Record<string, string>): Promise<AttackReportResult> {
    this.load();
    const entry = this.entries.find(row => row.id === id && row.payload.attacker_pid === uid);
    if (!entry) return { status: 'rejected', operationId: id, message: 'This report belongs to a different account or is unavailable.' };
    if (this.inflight.has(id) || ['reported', 'rejected'].includes(entry.state) || entry.state === 'unconfirmed' && entry.protocol === 'legacy') return result(entry);
    this.inflight.add(id);
    try {
      if (!this.protocol) {
        const probe = await this.request(`${this.baseUrl}/rest/v1/fhq_attacks?select=operation_id&limit=0`, { headers });
        if (probe.ok) this.protocol = 'idempotent';
        else {
          const error: unknown = await probe.json().catch(() => null);
          // A definite missing column is the only condition permitting legacy mode.
          if (probe.status === 400 && isRecord(error) && error.code === '42703') this.protocol = 'legacy';
          else return result(entry);
        }
      }
      entry.protocol = this.protocol;
      // Never retry an operation that was originally submitted without a server key,
      // even if the server has since upgraded and now supports those keys.
      if (entry.state === 'unconfirmed' && entry.protocol !== 'idempotent') return result(entry);
      entry.state = 'sending';
      if (!this.persist()) { entry.state = 'queued'; return { status: 'rejected', operationId: id, message: 'This device could not persist report delivery.' }; }
      const idempotent = entry.protocol === 'idempotent';
      const res = await this.request(`${this.baseUrl}/rest/v1/fhq_attacks${idempotent ? '?on_conflict=attacker_pid,operation_id' : ''}`, {
        method: 'POST', headers: { ...headers, Prefer: idempotent ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' },
        body: JSON.stringify([{ ...entry.payload, ...(idempotent ? { operation_id: id } : {}) }]),
      });
      if (res.ok) {
        const rows: unknown = await res.json();
        // A duplicate returns no new row. Verify the stored operation belongs to us
        // and matches before acknowledging (the key alone never proves its payload).
        if (idempotent && Array.isArray(rows) && rows.length === 0) {
          const check = await this.request(`${this.baseUrl}/rest/v1/fhq_attacks?attacker_pid=eq.${encodeURIComponent(uid)}&operation_id=eq.${id}&select=target_pid,attacker_pid,attacker_name,stars,pct,coins_lost,replay&limit=1`, { headers });
          const old: unknown = check.ok ? await check.json() : null;
          entry.state = Array.isArray(old) && old.length === 1 && samePayload(old[0], entry.payload) ? 'reported' : 'unconfirmed';
        } else entry.state = Array.isArray(rows) && rows.length === 1 && isRecord(rows[0]) && Number.isSafeInteger(rows[0].id) && samePayload(rows[0], entry.payload) ? 'reported' : 'unconfirmed';
      } else entry.state = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? 'rejected' : 'unconfirmed';
      this.persist(); return result(entry);
    } catch { if (entry.state === 'sending') entry.state = 'unconfirmed'; this.persist(); return result(entry); }
    finally { this.inflight.delete(id); }
  }
  async retry(uid: string, headers: Record<string, string>): Promise<AttackReportResult[]> {
    this.load();
    const ids = this.entries.filter(entry => entry.payload.attacker_pid === uid && (entry.state === 'queued' || entry.state === 'unconfirmed' && entry.protocol === 'idempotent')).map(entry => entry.id);
    const results: AttackReportResult[] = [];
    for (const id of ids) results.push(await this.send(id, uid, headers));
    return results;
  }
}
const samePayload = (stored: unknown, expected: AttackPayload): boolean => isRecord(stored)
  && stored.target_pid === expected.target_pid && stored.attacker_pid === expected.attacker_pid && stored.attacker_name === expected.attacker_name
  && stored.stars === expected.stars && stored.pct === expected.pct && stored.coins_lost === expected.coins_lost
  // Postgres jsonb normalizes property order; compare replay content recursively.
  && canonicalJson(stored.replay) === canonicalJson(expected.replay);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
