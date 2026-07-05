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
    const res = await fetch(`${URL_}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!res.ok) return null;
    const s = toSession(await res.json());
    saveSession(s);
    return s;
  } catch { return null; }
};

const refreshSession = async (s: Session): Promise<Session | null> => {
  try {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) return null;
    const ns = toSession(await res.json());
    saveSession(ns);
    return ns;
  } catch { return null; }
};

let inflight: Promise<Session | null> | null = null;
const ensureSession = async (): Promise<Session | null> => {
  if (!pvpEnabled()) return null;
  const cur = loadSession();
  if (cur && cur.expires_at > Date.now() / 1000 + 60) return cur;
  if (!inflight) {
    inflight = (async () => (cur?.refresh_token ? await refreshSession(cur) : null) ?? await signUpAnonymous())()
      .finally(() => { inflight = null; });
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
export interface LiveAttack { id: number; attacker_name: string; stars: number; pct: number; coins_lost: number; created_at: string; replay?: unknown; }
export interface LeaderRow { pid: string; name: string; trophies: number; }

/** Publish (upsert) my base snapshot so other players can raid it. Fire-and-forget. */
export const publishBase = async (name: string, trophies: number, layout: BattleBuildingDef[]): Promise<void> => {
  if (!pvpEnabled()) return;
  try {
    const h = await authedHeaders();
    if (!h) return;
    const s = loadSession()!;
    await fetch(`${URL_}/rest/v1/fhq_bases?on_conflict=pid`, {
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
    const lo = Math.max(0, trophies - 200), hi = trophies + 400;
    const q = (extra: string) => fetch(`${URL_}/rest/v1/fhq_bases?pid=neq.${playerId()}&select=pid,name,trophies,layout${extra}&limit=12`, { headers: readHeaders() });
    let res = await q(`&trophies=gte.${lo}&trophies=lte.${hi}`);
    let rows: LiveBase[] = res.ok ? await res.json() : [];
    if (!rows.length) { res = await q(''); rows = res.ok ? await res.json() : []; }
    return rows.sort(() => Math.random() - 0.5).slice(0, 3);
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
    await fetch(`${URL_}/rest/v1/fhq_attacks`, {
      method: 'POST', headers: h,
      body: JSON.stringify([{ target_pid: targetPid, attacker_pid: s.uid, attacker_name: attackerName.slice(0, 40), stars, pct, coins_lost: coinsLost, replay: replayJson }]),
    });
  } catch { /* fire-and-forget */ }
};

/** Top real coaches by trophies — the LIVE leaderboard (no fake teams). */
export const fetchLeaderboard = async (limit = 20): Promise<LeaderRow[]> => {
  if (!pvpEnabled()) return [];
  try {
    const res = await fetch(
      `${URL_}/rest/v1/fhq_bases?select=pid,name,trophies&order=trophies.desc,updated_at.desc&limit=${limit}`,
      { headers: readHeaders() },
    );
    return res.ok ? await res.json() : [];
  } catch { return []; }
};

/** Attacks on MY base since the last sync (applied to the defense log on load). */
export const fetchAttacksOnMe = async (sinceIso: string): Promise<LiveAttack[]> => {
  if (!pvpEnabled()) return [];
  try {
    await ensureSession(); // makes sure fhq_pid is my auth uid before we query by it
    const res = await fetch(
      `${URL_}/rest/v1/fhq_attacks?target_pid=eq.${playerId()}&created_at=gt.${encodeURIComponent(sinceIso)}&select=id,attacker_name,stars,pct,coins_lost,created_at,replay&order=created_at.asc&limit=20`,
      { headers: readHeaders() },
    );
    return res.ok ? await res.json() : [];
  } catch { return []; }
};
