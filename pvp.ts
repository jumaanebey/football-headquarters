// --- LIVE RIVALS: real asynchronous PvP, the Clash way. ---
// You never fight a live-controlled opponent — you raid a REAL player's published base
// layout, and your attack lands in THEIR defense log next time they open the game.
//
// HARDENED (2026-07-05): every device gets an anonymous Supabase Auth identity. Your pid
// IS your auth uid — RLS lets only YOU write your base, attack reports are signed with
// your JWT, server constraints bound every number, and a trigger rate-limits attacks.
// Plain fetch (no SDK); everything is a graceful no-op until the VITE_ env vars are set.

import { BattleBuildingDef } from './battle';

const env = (import.meta as any).env || {};
const URL_ = env.VITE_SUPABASE_URL as string | undefined;
const ANON = env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const pvpEnabled = () => !!(URL_ && ANON);

// ── Anonymous auth session ───────────────────────────────────────────────────
interface Session { access_token: string; refresh_token: string; expires_at: number; uid: string }
// Every call gets a hard 10s budget — a hanging cell-network fetch must never
// wedge "Sync now" / sign-in / matchmaking forever. Falls back cleanly where
// AbortSignal.timeout is unavailable (very old WebKit).
const tfetch = (url: string, init?: RequestInit): Promise<Response> =>
  fetch(url, { ...init, signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(10000) : undefined });

const SESSION_KEY = 'fhq_session_v1';

const loadSession = (): Session | null => {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const saveSession = (s: Session | null) => {
  try {
    if (s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); localStorage.setItem('fhq_pid', s.uid); }
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
};
const toSession = (j: any): Session | null =>
  j?.access_token && j?.user?.id
    ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600), uid: j.user.id }
    : null;

const signUpAnonymous = async (): Promise<Session | null> => {
  try {
    const res = await tfetch(`${URL_}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!res.ok) return null;
    const s = toSession(await res.json());
    saveSession(s);
    return s;
  } catch { return null; }
};

// Refresh outcome distinguishes "the token is DEAD" (4xx — server rejected it)
// from "the network hiccuped" (5xx / timeout). Only a dead token may fall through
// to a fresh anonymous signup — a transient failure used to mint a brand-new
// identity and silently orphan the player's cloud save, base, and trophies.
const refreshSession = async (s: Session): Promise<{ session: Session | null; tokenDead: boolean }> => {
  try {
    const res = await tfetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) return { session: null, tokenDead: res.status >= 400 && res.status < 500 && res.status !== 429 };
    const ns = toSession(await res.json());
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
        if (!r.tokenDead) return null; // transient — keep the identity, no-op this call, retry later
      }
      return await signUpAnonymous(); // no session at all, or a definitively dead token
    })().finally(() => { inflight = null; });
  }
  return inflight;
};

/** Stable player id for this device = your anonymous auth uid (set after first session). */
export const playerId = (): string => {
  let id = localStorage.getItem('fhq_pid');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); // offline placeholder
    localStorage.setItem('fhq_pid', id);
  }
  return id;
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

/** Publish (upsert) my base snapshot so other players can raid it. Fire-and-forget. */
export const publishBase = async (name: string, trophies: number, layout: BattleBuildingDef[]): Promise<void> => {
  if (!pvpEnabled()) return;
  try {
    const h = await authedHeaders();
    if (!h) return;
    const s = loadSession()!;
    await tfetch(`${URL_}/rest/v1/fhq_bases?on_conflict=pid`, {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ pid: s.uid, name: name.slice(0, 40), trophies, layout, updated_at: new Date().toISOString() }]),
    });
  } catch { /* offline / not configured — fine */ }
};

/** Up to 3 real rival bases near my trophy count (widens if the bracket is empty). */
export const findOpponents = async (trophies: number): Promise<LiveBase[]> => {
  if (!pvpEnabled()) return [];
  try {
    // DISCOVERY is lightweight: pid,name,trophies only — never pull the 60KB `layout`
    // jsonb for 12 candidates just to throw 9 away. We hydrate the 3 winners below.
    const lo = Math.max(0, trophies - 200), hi = trophies + 400;
    const q = (extra: string) => fetch(`${URL_}/rest/v1/fhq_bases?pid=neq.${playerId()}&select=pid,name,trophies${extra}&limit=12`, { headers: readHeaders() });
    let res = await q(`&trophies=gte.${lo}&trophies=lte.${hi}`);
    let rows: LeaderRow[] = res.ok ? await res.json() : [];
    if (!rows.length) { res = await q(''); rows = res.ok ? await res.json() : []; }
    const chosen = rows.sort(() => Math.random() - 0.5).slice(0, 3);
    // Hydrate only the picked bases (3 layout fetches, not 12). Drop any that vanished.
    const bases = await Promise.all(chosen.map(r => fetchBase(r.pid)));
    return bases.filter((b): b is LiveBase => b !== null);
  } catch { return []; }
};

/** Tell the defender they were raided (feeds their defense log + revenge). JWT-signed. */
export const reportAttack = async (targetPid: string, attackerName: string, stars: number, pct: number, coinsLost: number, replay?: unknown): Promise<void> => {
  if (!pvpEnabled()) return;
  try {
    const h = await authedHeaders();
    if (!h) return;
    const s = loadSession()!;
    // Attach the recorded drive so the defender can watch it (server caps size at 80KB).
    const replayJson = replay && JSON.stringify(replay).length < 75000 ? replay : null;
    await tfetch(`${URL_}/rest/v1/fhq_attacks`, {
      method: 'POST', headers: h,
      body: JSON.stringify([{ target_pid: targetPid, attacker_pid: s.uid, attacker_name: attackerName.slice(0, 40), stars, pct, coins_lost: coinsLost, replay: replayJson }]),
    });
  } catch { /* fire-and-forget */ }
};

/** One specific rival's CURRENT published base (revenge hits the real thing). */
export const fetchBase = async (pid: string): Promise<LiveBase | null> => {
  if (!pvpEnabled()) return null;
  try {
    const res = await tfetch(
      `${URL_}/rest/v1/fhq_bases?pid=eq.${encodeURIComponent(pid)}&select=pid,name,trophies,layout&limit=1`,
      { headers: readHeaders() },
    );
    const rows: LiveBase[] = res.ok ? await res.json() : [];
    return rows[0] ?? null;
  } catch { return null; }
};

/** Top real coaches by trophies — the LIVE leaderboard (no fake teams). */
export const fetchLeaderboard = async (limit = 20): Promise<LeaderRow[]> => {
  if (!pvpEnabled()) return [];
  try {
    const res = await tfetch(
      `${URL_}/rest/v1/fhq_bases?select=pid,name,trophies&order=trophies.desc,updated_at.desc&limit=${limit}`,
      { headers: readHeaders() },
    );
    return res.ok ? await res.json() : [];
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
    const h = await authedHeaders();
    if (!h) return null;
    const res = await tfetch(`${URL_}/auth/v1/user`, { headers: h });
    if (!res.ok) return null;
    const u = await res.json();
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
  if (!pvpEnabled()) return { ok: false, error: 'Cloud saves are not configured in this build.' };
  try {
    const res = await tfetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error_description || j?.msg || 'Sign-in failed.' };
    const s = toSession(j);
    saveSession(s);
    return { ok: !!s };
  } catch { return { ok: false, error: 'No connection — try again in a moment.' }; }
};

/** Back to a fresh guest identity on this device (the local club stays). */
export const signOutToGuest = (): void => {
  saveSession(null);
  try { localStorage.removeItem('fhq_pid'); } catch { /* ignore */ }
};

export interface CloudSave { save: unknown; club_name: string | null; updated_at: string }

/** A failed lookup and an empty account are NOT the same thing. Collapsing both to
 *  `null` let a timeout look like "this coach has no cloud save", and the caller
 *  answered that by PUSHING the local club — overwriting a real, older club in the
 *  cloud with whatever fresh save happened to be on the device. Callers must be able
 *  to tell the difference, so an error is now explicit and never means "empty". */
export type CloudFetch =
  | { status: 'found'; save: CloudSave }
  | { status: 'empty' }
  | { status: 'error' };

export const fetchCloudSave = async (): Promise<CloudFetch> => {
  if (!pvpEnabled()) return { status: 'error' };
  try {
    const h = await authedHeaders();
    if (!h) return { status: 'error' };            // not signed in / token refresh failed
    const s = loadSession()!;
    const res = await tfetch(`${URL_}/rest/v1/fhq_saves?pid=eq.${s.uid}&select=save,club_name,updated_at&limit=1`, { headers: h });
    if (!res.ok) return { status: 'error' };       // 4xx/5xx is NOT "no save"
    const rows: CloudSave[] = await res.json();
    return rows[0] ? { status: 'found', save: rows[0] } : { status: 'empty' };
  } catch { return { status: 'error' }; }          // timeout / offline is NOT "no save"
};

export const pushCloudSave = async (save: unknown, clubName: string, clubPower: number): Promise<boolean> => {
  if (!pvpEnabled()) return false;
  try {
    const h = await authedHeaders();
    if (!h) return false;
    const s = loadSession()!;
    const res = await tfetch(`${URL_}/rest/v1/fhq_saves?on_conflict=pid`, {
      method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ pid: s.uid, save, club_name: clubName.slice(0, 40), club_power: Math.round(clubPower), updated_at: new Date().toISOString() }]),
    });
    return res.ok;
  } catch { return false; }
};

/** Wipe my cloud footprint (save + published base). Local play is untouched. */
export const deleteCloudData = async (): Promise<boolean> => {
  if (!pvpEnabled()) return false;
  try {
    const h = await authedHeaders();
    if (!h) return false;
    const s = loadSession()!;
    const del = (table: string) => fetch(`${URL_}/rest/v1/${table}?pid=eq.${s.uid}`, { method: 'DELETE', headers: h });
    const [a, b] = await Promise.all([del('fhq_saves'), del('fhq_bases')]);
    return a.ok && b.ok;
  } catch { return false; }
};

/** Attacks on MY base since the last sync (applied to the defense log on load). */
export const fetchAttacksOnMe = async (sinceIso: string): Promise<LiveAttack[]> => {
  if (!pvpEnabled()) return [];
  try {
    await ensureSession(); // makes sure fhq_pid is my auth uid before we query by it
    const res = await tfetch(
      `${URL_}/rest/v1/fhq_attacks?target_pid=eq.${playerId()}&created_at=gt.${encodeURIComponent(sinceIso)}&select=id,attacker_name,attacker_pid,stars,pct,coins_lost,created_at,replay&order=created_at.asc&limit=20`,
      { headers: readHeaders() },
    );
    return res.ok ? await res.json() : [];
  } catch { return []; }
};
