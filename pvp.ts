// --- LIVE RIVALS: real asynchronous PvP, the Clash way. ---
// You never fight a live-controlled opponent — you raid a REAL player's published base
// layout, and your attack lands in THEIR defense log next time they open the game.
// Backed by Supabase (plain PostgREST over fetch — no SDK). Everything here is a graceful
// no-op until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set (see PVP-SETUP.md), so
// the game runs fully offline against generated rivals in the meantime.

import { BattleBuildingDef } from './battle';

const env = (import.meta as any).env || {};
const URL_ = env.VITE_SUPABASE_URL as string | undefined;
const ANON = env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const pvpEnabled = () => !!(URL_ && ANON);

const headers = () => ({ apikey: ANON!, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' });

/** Stable anonymous player id for this device. */
export const playerId = (): string => {
  let id = localStorage.getItem('fhq_pid');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('fhq_pid', id);
  }
  return id;
};

export interface LiveBase { pid: string; name: string; trophies: number; layout: BattleBuildingDef[]; }
export interface LiveAttack { id: number; attacker_name: string; stars: number; pct: number; coins_lost: number; created_at: string; }

/** Publish (upsert) my base snapshot so other players can raid it. Fire-and-forget. */
export const publishBase = async (name: string, trophies: number, layout: BattleBuildingDef[]): Promise<void> => {
  if (!pvpEnabled()) return;
  try {
    await fetch(`${URL_}/rest/v1/fhq_bases?on_conflict=pid`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ pid: playerId(), name, trophies, layout, updated_at: new Date().toISOString() }]),
    });
  } catch { /* offline / not configured — fine */ }
};

/** Up to 3 real rival bases near my trophy count (widens if the bracket is empty). */
export const findOpponents = async (trophies: number): Promise<LiveBase[]> => {
  if (!pvpEnabled()) return [];
  try {
    const lo = Math.max(0, trophies - 200), hi = trophies + 400;
    const q = (extra: string) => fetch(`${URL_}/rest/v1/fhq_bases?pid=neq.${playerId()}&select=pid,name,trophies,layout${extra}&limit=12`, { headers: headers() });
    let res = await q(`&trophies=gte.${lo}&trophies=lte.${hi}`);
    let rows: LiveBase[] = res.ok ? await res.json() : [];
    if (!rows.length) { res = await q(''); rows = res.ok ? await res.json() : []; }
    return rows.sort(() => Math.random() - 0.5).slice(0, 3);
  } catch { return []; }
};

/** Tell the defender they were raided (feeds their defense log + revenge). */
export const reportAttack = async (targetPid: string, attackerName: string, stars: number, pct: number, coinsLost: number): Promise<void> => {
  if (!pvpEnabled()) return;
  try {
    await fetch(`${URL_}/rest/v1/fhq_attacks`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify([{ target_pid: targetPid, attacker_name: attackerName, stars, pct, coins_lost: coinsLost }]),
    });
  } catch { /* fire-and-forget */ }
};

export interface LeaderRow { pid: string; name: string; trophies: number; }

/** Top real coaches by trophies — the LIVE leaderboard (no fake teams). */
export const fetchLeaderboard = async (limit = 20): Promise<LeaderRow[]> => {
  if (!pvpEnabled()) return [];
  try {
    const res = await fetch(
      `${URL_}/rest/v1/fhq_bases?select=pid,name,trophies&order=trophies.desc,updated_at.desc&limit=${limit}`,
      { headers: headers() },
    );
    return res.ok ? await res.json() : [];
  } catch { return []; }
};

/** Attacks on MY base since the last sync (applied to the defense log on load). */
export const fetchAttacksOnMe = async (sinceIso: string): Promise<LiveAttack[]> => {
  if (!pvpEnabled()) return [];
  try {
    const res = await fetch(
      `${URL_}/rest/v1/fhq_attacks?target_pid=eq.${playerId()}&created_at=gt.${encodeURIComponent(sinceIso)}&select=id,attacker_name,stars,pct,coins_lost,created_at&order=created_at.asc&limit=20`,
      { headers: headers() },
    );
    return res.ok ? await res.json() : [];
  } catch { return []; }
};
