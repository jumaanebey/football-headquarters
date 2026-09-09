// --- LIVE RIVALS: real asynchronous PvP, the Clash way. ---
// You never fight a live-controlled opponent — you raid a REAL player's published base
// layout, and your attack lands in THEIR defense log next time they open the game.
//
// HARDENED (2026-07-05): every device gets an anonymous Supabase Auth identity. Your pid
// IS your auth uid — RLS lets only YOU write your base, attack reports are signed with
// your JWT, server constraints bound every number, and a trigger rate-limits attacks.
// Plain fetch (no SDK); everything is a graceful no-op until the VITE_ env vars are set.

import { BattleBuildingDef } from './battle';
import { CloudSaveStore, jsonBytes, type CloudWriteResult, type CloudReadResult, type CloudSaveRow } from './game/online/cloudStore';
export type { CloudWriteResult } from './game/online/cloudStore';
import { finiteWithin, isPlayerId, validAttack, validLayout, validLeader, validLiveBase } from './game/online/validation';
import { AttackOutbox, type AttackReportResult } from './game/online/attackOutbox';
import { validateReplay } from './game/combat/replay';
export type { AttackReportResult } from './game/online/attackOutbox';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const pvpEnabled = () => !!(URL_ && ANON);

// ── Anonymous auth session ───────────────────────────────────────────────────
interface Session { access_token: string; refresh_token: string; expires_at: number; uid: string }
// Every call gets a hard 10s budget — a hanging cell-network fetch must never
// wedge "Sync now" / sign-in / matchmaking forever. Falls back cleanly where
// AbortSignal.timeout is unavailable (very old WebKit).
const tfetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

const SESSION_KEY = 'fhq_session_v1';

let memorySession: Session | null = null;
let sessionEpoch = 0;
const isSession = (s: any): s is Session => !!s && typeof s.access_token === 'string' && !!s.access_token
  && typeof s.refresh_token === 'string' && !!s.refresh_token && typeof s.uid === 'string'
  && /^[0-9a-f-]{36}$/i.test(s.uid) && Number.isFinite(s.expires_at);
const loadSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (isSession(stored)) return stored;
  } catch { /* In-memory sessions also support restricted browser storage. */ }
  return memorySession;
};
const saveSession = (s: Session | null) => {
  memorySession = s;
  try {
    if (s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); localStorage.setItem('fhq_pid', s.uid); }
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* The signed-in session remains usable for this page. */ }
};
const toSession = (j: any): Session | null => {
  const result = { access_token: j?.access_token, refresh_token: j?.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (Number.isFinite(j?.expires_in) ? j.expires_in : 3600), uid: j?.user?.id };
  return isSession(result) ? result : null;
};
const hasPreviousIdentity = (): boolean => {
  try { return !!localStorage.getItem(SESSION_KEY) || /^[0-9a-f-]{36}$/i.test(localStorage.getItem('fhq_pid') ?? ''); }
  catch { return memorySession !== null; }
};

const signUpAnonymous = async (): Promise<Session | null> => {
  const epoch = sessionEpoch;
  try {
    const res = await tfetch(`${URL_}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!res.ok) return null;
    const s = toSession(await res.json());
    if (!s || epoch !== sessionEpoch) return null;
    saveSession(s);
    return s;
  } catch { return null; }
};

// Refresh outcome distinguishes "the token is DEAD" (4xx — server rejected it)
// from "the network hiccuped" (5xx / timeout). Neither outcome may create a new
// anonymous identity: preserve the account until the player explicitly signs out.
const refreshSession = async (s: Session): Promise<{ session: Session | null; tokenDead: boolean }> => {
  const epoch = sessionEpoch;
  try {
    const res = await tfetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) return { session: null, tokenDead: res.status >= 400 && res.status < 500 && res.status !== 429 };
    const ns = toSession(await res.json());
    if (!ns || ns.uid !== s.uid || epoch !== sessionEpoch) return { session: null, tokenDead: false };
    saveSession(ns);
    return { session: ns, tokenDead: false };
  } catch { return { session: null, tokenDead: false }; }
};

let inflight: Promise<Session | null> | null = null;
const ensureSession = async (): Promise<Session | null> => {
  if (!pvpEnabled()) return null;
  const cur = loadSession();
  if (cur && cur.expires_at > Date.now() / 1000 + 60) return cur;
  if (!inflight) {
    inflight = (async () => {
      if (cur?.refresh_token) {
        const r = await refreshSession(cur);
        if (r.session) return r.session;
        // Even a rejected refresh token must not mint a replacement identity.
        // The player can sign back in or explicitly choose Sign out.
        return null;
      }
      if (hasPreviousIdentity()) return null;
      return await signUpAnonymous(); // first-time guests only
    })().finally(() => { inflight = null; });
  }
  return inflight;
};

/** Stable player id for this device = your anonymous auth uid (set after first session). */
let offlineId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const playerId = (): string => {
  const session = loadSession();
  if (session) return session.uid;
  try {
    const id = localStorage.getItem('fhq_pid');
    if (id) return id;
    localStorage.setItem('fhq_pid', offlineId);
  } catch { /* Keep a stable id within this page even when storage is unavailable. */ }
  return offlineId;
};

interface AuthContext { uid: string; epoch: number; headers: Record<string, string> }
const isCurrentContext = (context: AuthContext): boolean => context.epoch === sessionEpoch && loadSession()?.uid === context.uid;
const authedContext = async (): Promise<AuthContext | null> => {
  const epoch = sessionEpoch;
  const s = await ensureSession();
  if (!s || epoch !== sessionEpoch || loadSession()?.uid !== s.uid) return null;
  return { uid: s.uid, epoch, headers: { apikey: ANON!, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } };
};
const deletingOwners = new Set<string>();
const ownerWrites = new Map<string, Set<Promise<unknown>>>();
const trackOwnerWrite = async <T>(uid: string, operation: () => Promise<T>): Promise<T> => {
  const pending = operation();
  const writes = ownerWrites.get(uid) ?? new Set<Promise<unknown>>();
  writes.add(pending); ownerWrites.set(uid, writes);
  try { return await pending; }
  finally { writes.delete(pending); if (!writes.size) ownerWrites.delete(uid); }
};
const authedHeaders = async (): Promise<Record<string, string> | null> => {
  const s = await ensureSession();
  if (!s) return null;
  return { apikey: ANON!, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' };
};
// Reads are public — anon key alone is fine (works even before the first session lands).
const readHeaders = () => ({ apikey: ANON!, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' });

export interface LiveBase { pid: string; name: string; trophies: number; layout: BattleBuildingDef[]; }
export interface LiveAttack { id: number; attacker_name: string; attacker_pid?: string; stars: number; pct: number; coins_lost: number; created_at: string; replay?: unknown; }
export interface LeaderRow { pid: string; name: string; trophies: number; }

/** Publish only a bounded base. The returned boolean acknowledges the HTTP write. */
export const publishBase = async (name: string, trophies: number, layout: BattleBuildingDef[]): Promise<boolean> => {
  if (!pvpEnabled() || !validLayout(layout) || !Number.isInteger(trophies) || !finiteWithin(trophies, 0, 20_000)) return false;
  try {
    const context = await authedContext();
    if (!context || deletingOwners.has(context.uid)) return false;
    return await trackOwnerWrite(context.uid, async () => {
      const res = await tfetch(`${URL_}/rest/v1/fhq_bases?on_conflict=pid`, {
        method: 'POST', headers: { ...context.headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{ pid: context.uid, name: name.trim().slice(0, 40) || 'Club', trophies, layout, updated_at: new Date().toISOString() }]),
      });
      return isCurrentContext(context) && res.ok;
    });
  } catch { return false; }
};

/** Up to 3 real rival bases near my trophy count (widens if the bracket is empty). */
export const findOpponents = async (trophies: number): Promise<LiveBase[]> => {
  if (!pvpEnabled()) return [];
  try {
    // DISCOVERY is lightweight: pid,name,trophies only — never pull the 60KB `layout`
    // jsonb for 12 candidates just to throw 9 away. We hydrate the 3 winners below.
    const rating = finiteWithin(trophies, 0, 20_000) ? trophies : 0;
    const lo = Math.max(0, rating - 200), hi = rating + 400;
    const q = (extra: string) => tfetch(`${URL_}/rest/v1/fhq_bases?pid=neq.${encodeURIComponent(playerId())}&select=pid,name,trophies${extra}&limit=12`, { headers: readHeaders() });
    let res = await q(`&trophies=gte.${lo}&trophies=lte.${hi}`);
    let data: unknown = res.ok ? await res.json() : [];
    let rows = Array.isArray(data) ? data.filter(validLeader) : [];
    if (!rows.length) { res = await q(''); data = res.ok ? await res.json() : []; rows = Array.isArray(data) ? data.filter(validLeader) : []; }
    const chosen = rows.sort(() => Math.random() - 0.5).slice(0, 3);
    // Hydrate only the picked bases (3 layout fetches, not 12). Drop any that vanished.
    const bases = await Promise.all(chosen.map(r => fetchBase(r.pid)));
    return bases.filter((b): b is LiveBase => b !== null);
  } catch { return []; }
};

const attackOutbox = new AttackOutbox(URL_ ?? '', tfetch, {
  getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
});
/** Durable report delivery is separate from the local battle reward. Delivered scores
 * remain client-reported until a server executes the versioned battle commands. */
export const reportAttack = async (targetPid: string, attackerName: string, stars: number, pct: number, coinsLost: number, replay?: unknown, operationId = crypto.randomUUID()): Promise<AttackReportResult> => {
  if (!pvpEnabled()) return { status: 'rejected', operationId, message: 'Online rivals are unavailable in this build.' };
  const session = loadSession();
  if (!session) return { status: 'rejected', operationId, message: 'Sign in before reporting a live raid. The local result remains on this device.' };
  const film = replay == null ? null : validateReplay(replay);
  if (replay != null && (!film || jsonBytes(film) >= 75_000)) return { status: 'rejected', operationId, message: 'This raid recording could not be validated for delivery.' };
  const queued = attackOutbox.queue(operationId, { target_pid: targetPid, attacker_pid: session.uid, attacker_name: attackerName.trim().slice(0, 40) || 'Club', stars, pct, coins_lost: coinsLost, replay: film });
  if (queued.status !== 'pending') return queued;
  const context = await authedContext();
  if (!context || context.uid !== session.uid) return queued;
  return attackOutbox.send(operationId, context.uid, context.headers);
};
export const pendingAttackReports = (): AttackReportResult[] => attackOutbox.list(playerId()).filter(row => row.status === 'pending' || row.status === 'unconfirmed');
export const retryAttackReports = async (): Promise<AttackReportResult[]> => {
  const context = await authedContext();
  return context ? attackOutbox.retry(context.uid, context.headers) : pendingAttackReports();
};

/** One specific rival's CURRENT published base (revenge hits the real thing). */
export const fetchBase = async (pid: string): Promise<LiveBase | null> => {
  if (!pvpEnabled() || !isPlayerId(pid)) return null;
  try {
    const res = await tfetch(
      `${URL_}/rest/v1/fhq_bases?pid=eq.${encodeURIComponent(pid)}&select=pid,name,trophies,layout&limit=1`,
      { headers: readHeaders() },
    );
    const rows: unknown = res.ok ? await res.json() : [];
    return Array.isArray(rows) && validLiveBase(rows[0]) ? rows[0] : null;
  } catch { return null; }
};

/** Top real coaches by trophies — the LIVE leaderboard (no fake teams). */
export const fetchLeaderboard = async (limit = 20): Promise<LeaderRow[]> => {
  if (!pvpEnabled()) return [];
  try {
    const res = await tfetch(
      `${URL_}/rest/v1/fhq_bases?select=pid,name,trophies&order=trophies.desc,updated_at.desc&limit=${Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 20}`,
      { headers: readHeaders() },
    );
    const rows: unknown = res.ok ? await res.json() : [];
    return Array.isArray(rows) ? rows.filter(validLeader) : [];
  } catch { return []; }
};

// ── PROFILES & CLOUD SAVES ─────────────────────────────────────────────────────
// The anonymous device identity UPGRADES to a real account (same auth uid — the
// published base, raid history, and pid all carry over), and the save syncs to
// fhq_saves so the club plays from any device. Same graceful-no-op philosophy:
// every call fails quietly when offline or unconfigured.

export interface ProfileInfo {
  uid: string;
  email: string | null;        // ACTIVE (confirmed) account email — null while guest/pending
  pendingEmail: string | null; // email awaiting its confirmation link (cloud sync already works;
                               // only signing in from ANOTHER device needs the confirm)
  confirmed: boolean;
}

/** Who am I? email+pendingEmail both null → still a guest (anonymous identity). */
export const getProfile = async (): Promise<ProfileInfo | null> => {
  if (!pvpEnabled()) return null;
  try {
    const context = await authedContext();
    if (!context) return null;
    const res = await tfetch(`${URL_}/auth/v1/user`, { headers: context.headers });
    if (!res.ok) return null;
    const u = await res.json();
    if (!isCurrentContext(context) || u.id !== context.uid) return null;
    const confirmed = !!u.email_confirmed_at;
    return {
      uid: u.id,
      email: confirmed ? (u.email || null) : null,
      pendingEmail: u.new_email || (!confirmed && u.email ? u.email : null),
      confirmed,
    };
  } catch { return null; }
};

/** Guest → account: attaches email+password to the CURRENT anonymous user. */
export const linkAccount = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
  if (!pvpEnabled()) return { ok: false, error: 'Cloud saves are not configured in this build.' };
  try {
    const h = await authedHeaders();
    if (!h) return { ok: false, error: 'No connection — try again in a moment.' };
    const res = await tfetch(`${URL_}/auth/v1/user`, { method: 'PUT', headers: h, body: JSON.stringify({ email, password }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.msg || j?.error_description || 'Could not create the account.' };
    return { ok: true };
  } catch { return { ok: false, error: 'No connection — try again in a moment.' }; }
};

/** Sign in on another device — the session (and pid) becomes the account's uid. */
export const signInWithPassword = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
  const epoch = ++sessionEpoch;
  inflight = null;
  if (!pvpEnabled()) return { ok: false, error: 'Cloud saves are not configured in this build.' };
  try {
    const res = await tfetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error_description || j?.msg || 'Sign-in failed.' };
    const s = toSession(j);
    if (!s || epoch !== sessionEpoch) return { ok: false, error: 'Sign-in was not confirmed. Please try again.' };
    saveSession(s);
    return { ok: true };
  } catch { return { ok: false, error: 'No connection — try again in a moment.' }; }
};

/** Back to a fresh guest identity on this device (the local club stays). */
export const signOutToGuest = (): void => {
  sessionEpoch++;
  inflight = null;
  saveSession(null);
  offlineId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try { localStorage.removeItem('fhq_pid'); } catch { /* ignore */ }
};

export type CloudSave = CloudSaveRow;
export type CloudFetch = CloudReadResult;
const cloudStore = new CloudSaveStore(URL_ ?? '', tfetch, {
  getItem: key => { try { return localStorage.getItem(key); } catch { return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Optional metadata persistence. */ } },
});
let cloudWriteStatus: CloudWriteResult = { status: 'unavailable', message: 'Cloud sync has not started.' };
const cloudListeners = new Set<(status: CloudWriteResult) => void>();
export const getCloudWriteStatus = (): CloudWriteResult => cloudWriteStatus;
export const subscribeCloudWriteStatus = (listener: (status: CloudWriteResult) => void): (() => void) => {
  cloudListeners.add(listener); return () => { cloudListeners.delete(listener); };
};
const emitCloudStatus = (result: CloudWriteResult): CloudWriteResult => {
  cloudWriteStatus = result;
  for (const listener of cloudListeners) { try { listener(result); } catch { /* UI listeners cannot reject a save. */ } }
  return result;
};
/** Explicit conflict resolution: call only after choosing the cloud or local club. */
export const acceptCloudRevision = (updatedAt: string | null): void => {
  const session = loadSession();
  if (session) cloudStore.acceptRevision(session.uid, updatedAt);
};
export const fetchCloudSave = async (): Promise<CloudFetch> => {
  if (!pvpEnabled()) return { status: 'error' };
  const context = await authedContext();
  if (!context) return { status: 'error' };
  const result = await cloudStore.read(context.uid, context.headers);
  return isCurrentContext(context) ? result : { status: 'error' };
};
export const pushCloudSaveDetailed = async (save: unknown, clubName: string, clubPower: number): Promise<CloudWriteResult> => {
  const epoch = sessionEpoch;
  if (!pvpEnabled()) return emitCloudStatus({ status: 'unavailable', message: 'Cloud saves are not configured in this build.' });
  const context = await authedContext();
  const changed: CloudWriteResult = { status: 'unavailable', message: 'The signed-in account changed. Cloud status was not applied to this club.' };
  if (epoch !== sessionEpoch) return changed;
  if (!context) return emitCloudStatus({ status: 'unavailable', message: 'Cloud access needs a connection or sign-in. Your club remains on this device.' });
  if (deletingOwners.has(context.uid)) return { status: 'pending', message: 'Cloud deletion is in progress. Uploads are paused.' };
  emitCloudStatus({ status: 'pending', message: 'Saving your club to the cloud…' });
  const result = await trackOwnerWrite(context.uid, () => cloudStore.write(context.uid, context.headers, save, clubName, clubPower));
  if (!isCurrentContext(context)) return changed;
  // A deletion owns the final UI status while it waits for this write to settle.
  return deletingOwners.has(context.uid) ? result : emitCloudStatus(result);
};
/** Compatibility wrapper: true means one exact revision was acknowledged by the server. */
export const pushCloudSave = async (save: unknown, clubName: string, clubPower: number): Promise<boolean> =>
  (await pushCloudSaveDetailed(save, clubName, clubPower)).status === 'saved';

/** Wipe my cloud footprint (save + published base). Local play is untouched.
 * A 2xx DELETE can affect zero rows under RLS, so verify both owner rows are gone. */
export const deleteCloudData = async (): Promise<boolean> => {
  if (!pvpEnabled()) return false;
  const context = await authedContext();
  if (!context || deletingOwners.has(context.uid)) return false;
  deletingOwners.add(context.uid);
  try {
    // No new save/base upload can start after the gate closes. Existing writes
    // settle first so a slow request cannot recreate a row after its deletion.
    await Promise.allSettled([...ownerWrites.get(context.uid) ?? []]);
    if (!isCurrentContext(context)) return false;
    const url = (table: string) => `${URL_}/rest/v1/${table}?pid=eq.${encodeURIComponent(context.uid)}`;
    const del = (table: string) => tfetch(url(table), { method: 'DELETE', headers: context.headers });
    const responses = await Promise.all([del('fhq_saves'), del('fhq_bases')]);
    if (!responses.every(response => response.ok)) return false;
    const gone = await Promise.all(['fhq_saves', 'fhq_bases'].map(async table => {
      const response = await tfetch(`${url(table)}&select=pid&limit=1`, { headers: context.headers });
      const rows: unknown = response.ok ? await response.json() : null;
      return Array.isArray(rows) && rows.length === 0;
    }));
    if (isCurrentContext(context) && gone.every(Boolean)) { cloudStore.acceptRevision(context.uid, null); return true; }
    return false;
  } catch { return false; }
  finally { deletingOwners.delete(context.uid); }
};

export interface AttackCursor { createdAt: string; id: number }
export type AttackInbox =
  | { status: 'ok'; attacks: LiveAttack[]; cursor: AttackCursor; hasMore: boolean; playerId: string }
  | { status: 'error' };
/** Upgrade baseline: snapshot the newest known report without replaying historical
 * currency losses whose old device-only watermark has no trustworthy owner. */
export const fetchAttackInboxBaseline = async (): Promise<{ status: 'ok'; cursor: AttackCursor; playerId: string } | { status: 'error' }> => {
  if (!pvpEnabled()) return { status: 'error' };
  try {
    const context = await authedContext();
    if (!context) return { status: 'error' };
    const res = await tfetch(`${URL_}/rest/v1/fhq_attacks?target_pid=eq.${encodeURIComponent(context.uid)}&select=id,created_at&order=created_at.desc,id.desc&limit=1`, { headers: context.headers });
    if (!res.ok) return { status: 'error' };
    const rows: unknown = await res.json();
    if (!Array.isArray(rows) || rows.length > 1) return { status: 'error' };
    const row = rows[0];
    if (row !== undefined && (!row || typeof row !== 'object' || !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)))) return { status: 'error' };
    return { status: 'ok', cursor: row ? { createdAt: row.created_at, id: row.id } : { createdAt: new Date(0).toISOString(), id: 0 }, playerId: context.uid };
  } catch { return { status: 'error' }; }
};
/** Stable (timestamp, id) paging. Persist the cursor WITH the applied club save;
 * advancing a separate cursor before saving the losses can skip a whole page. */
export const fetchAttackInbox = async (cursor: AttackCursor = { createdAt: new Date(0).toISOString(), id: 0 }): Promise<AttackInbox> => {
  if (!pvpEnabled() || !Number.isFinite(Date.parse(cursor.createdAt)) || !Number.isSafeInteger(cursor.id) || cursor.id < 0) return { status: 'error' };
  try {
    const context = await authedContext();
    if (!context) return { status: 'error' };
    const after = `or=(created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id}))`;
    const res = await tfetch(`${URL_}/rest/v1/fhq_attacks?target_pid=eq.${encodeURIComponent(context.uid)}&${after}&select=id,attacker_name,attacker_pid,stars,pct,coins_lost,created_at,replay&order=created_at.asc,id.asc&limit=20`, { headers: context.headers });
    if (!res.ok) return { status: 'error' };
    const rows: unknown = await res.json();
    if (!Array.isArray(rows) || rows.length > 20 || !rows.every(validAttack)) return { status: 'error' };
    const attacks = rows.map(row => ({ ...row, replay: row.replay == null ? undefined : validateReplay(row.replay) ?? undefined }));
    const last = attacks[attacks.length - 1];
    return { status: 'ok', attacks, cursor: last ? { createdAt: last.created_at, id: last.id } : cursor, hasMore: attacks.length === 20, playerId: context.uid };
  } catch { return { status: 'error' }; }
};
/** Legacy adapter. Inclusive timestamp avoids dropping attacks sharing the same
 * timestamp; new callers should persist fetchAttackInbox's complete cursor. */
export const fetchAttacksOnMe = async (sinceIso: string): Promise<LiveAttack[]> => {
  const result = await fetchAttackInbox({ createdAt: sinceIso, id: 0 });
  return result.status === 'ok' ? result.attacks : [];
};
