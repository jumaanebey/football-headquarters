/** Compare-and-set transport for the existing cloud-save table. A lost response can
 * never turn the next autosave into an unconditional overwrite. This is concurrency
 * protection for honest devices; it does not make client-authored progress authoritative. */
export interface CloudSaveRow { save: unknown; club_name: string | null; updated_at: string }
export type CloudWriteResult =
  | { status: 'saved'; updatedAt: string }
  | { status: 'conflict'; message: string }
  | { status: 'error' | 'unavailable' | 'invalid' | 'pending'; message: string };
export type CloudReadResult =
  | { status: 'found'; save: CloudSaveRow; conflict?: boolean }
  | { status: 'empty'; conflict?: boolean }
  | { status: 'error' };
export interface CloudTransport { (url: string, init?: RequestInit): Promise<Response> }
interface Revision { value: string | null; blocked: boolean }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'fhq_cloud_revision_v1';
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validStamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const jsonBytes = (value: unknown): number => {
  try { const encoded = JSON.stringify(value); return encoded === undefined ? Infinity : new TextEncoder().encode(encoded).length; }
  catch { return Infinity; }
};
const conflict = (): CloudWriteResult => ({ status: 'conflict', message: 'Another device changed this cloud club. Choose which club to keep before syncing.' });

export class CloudSaveStore {
  private revisions = new Map<string, Revision>();
  private writes = new Set<string>();
  constructor(private baseUrl: string, private request: CloudTransport, private storage?: StorageLike) {}
  private revision(uid: string): Revision | undefined {
    if (this.revisions.has(uid)) return this.revisions.get(uid);
    try {
      const stored: unknown = JSON.parse(this.storage?.getItem(`${KEY}:${uid}`) ?? 'null');
      if (isRecord(stored) && (stored.value === null || validStamp(stored.value)) && typeof stored.blocked === 'boolean') {
        const revision = { value: stored.value as string | null, blocked: stored.blocked };
        this.revisions.set(uid, revision); return revision;
      }
    } catch { /* Storage is optional. In-memory protection remains active. */ }
    return undefined;
  }
  private remember(uid: string, revision: Revision): void {
    this.revisions.set(uid, revision);
    try { this.storage?.setItem(`${KEY}:${uid}`, JSON.stringify(revision)); } catch { /* In-memory protection remains active. */ }
  }
  /** Called only after the player has chosen the fetched cloud or local club. */
  acceptRevision(uid: string, revision: string | null): void {
    if (revision === null || validStamp(revision)) this.remember(uid, { value: revision, blocked: false });
  }
  async read(uid: string, headers: Record<string, string>): Promise<CloudReadResult> {
    try {
      const res = await this.request(`${this.baseUrl}/rest/v1/fhq_saves?pid=eq.${encodeURIComponent(uid)}&select=save,club_name,updated_at&limit=1`, { headers });
      if (!res.ok) return { status: 'error' };
      const rows: unknown = await res.json();
      if (!Array.isArray(rows) || rows.length > 1) return { status: 'error' };
      const row: unknown = rows[0];
      if (row !== undefined && (!isRecord(row) || !isRecord(row.save) || !validStamp(row.updated_at) || !(row.club_name === null || typeof row.club_name === 'string'))) return { status: 'error' };
      const value = isRecord(row) ? row.updated_at as string : null;
      const previous = this.revision(uid);
      const blocked = previous ? previous.blocked || previous.value !== value : value !== null;
      // Seeing a newer remote row does not grant the next autosave permission to
      // overwrite it. Keep the accepted base until the user resolves the conflict.
      this.remember(uid, blocked ? { value: previous ? previous.value : value, blocked: true } : { value, blocked: false });
      return row === undefined ? { status: 'empty', conflict: blocked } : { status: 'found', save: row as unknown as CloudSaveRow, conflict: blocked };
    } catch { return { status: 'error' }; }
  }
  async write(uid: string, headers: Record<string, string>, save: unknown, clubName: string, clubPower: number): Promise<CloudWriteResult> {
    if (!isRecord(save) || jsonBytes(save) > 450_000 || !Number.isFinite(clubPower) || clubPower < 0 || clubPower > 2_000_000_000) {
      return { status: 'invalid', message: 'This club could not be uploaded. Export a backup and try again.' };
    }
    if (this.writes.has(uid)) return { status: 'pending', message: 'A cloud save is already in progress.' };
    this.writes.add(uid);
    try {
      let previous = this.revision(uid);
      if (!previous) {
        const read = await this.read(uid, headers);
        if (read.status === 'error') return { status: 'error', message: 'Could not check the cloud. Your club remains on this device.' };
        if (read.status === 'found') { this.remember(uid, { value: read.save.updated_at, blocked: true }); return conflict(); }
        previous = this.revision(uid)!;
      }
      if (previous.blocked) return conflict();
      const updatedAt = new Date(Math.max(Date.now(), previous.value ? Date.parse(previous.value) + 1 : 0)).toISOString();
      const body = { save, club_name: clubName.trim().slice(0, 40) || 'Club', club_power: Math.round(clubPower), updated_at: updatedAt };
      const endpoint = `${this.baseUrl}/rest/v1/fhq_saves`;
      // INSERT has no upsert fallback. PATCH must still match the version we read.
      const res = previous.value === null
        ? await this.request(`${endpoint}?select=updated_at`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify([{ pid: uid, ...body }]) })
        : await this.request(`${endpoint}?pid=eq.${encodeURIComponent(uid)}&updated_at=eq.${encodeURIComponent(previous.value)}&select=updated_at`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (res.status === 409) { this.remember(uid, { ...previous, blocked: true }); return conflict(); }
      if (!res.ok) return { status: 'error', message: 'Cloud save was not confirmed. Your club remains on this device.' };
      const rows: unknown = await res.json();
      if (Array.isArray(rows) && rows.length === 0) { this.remember(uid, { ...previous, blocked: true }); return conflict(); }
      if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0]) || !validStamp(rows[0].updated_at)) return { status: 'error', message: 'Cloud save was not confirmed. Check sync before retrying.' };
      this.remember(uid, { value: rows[0].updated_at, blocked: false });
      return { status: 'saved', updatedAt: rows[0].updated_at };
    } catch { return { status: 'error', message: 'Cloud save was not confirmed. Your club remains on this device.' }; }
    finally { this.writes.delete(uid); }
  }
}
