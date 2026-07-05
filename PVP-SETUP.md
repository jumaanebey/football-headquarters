# Live Rivals — PvP setup & security model

> Updated 2026-07-05 for the HARDENED stack. The old honor-system notes are obsolete —
> this file describes what actually runs in production.

## What Live Rivals is
Asynchronous, Clash-style PvP. You never fight a live-controlled opponent: you raid a
REAL player's **published base snapshot**, your attack (including a full **replay** of
every move you made) lands in their defense log, and they can watch it and take revenge
against **your** real base.

## Architecture
- **Backend:** Supabase project `ruzkpbvgzvqrrnexrffz` (tables `fhq_bases`, `fhq_attacks`).
- **Client:** plain PostgREST `fetch` calls in `pvp.ts` — no SDK.
- **Identity:** anonymous Supabase Auth. On first load each device silently creates an
  anonymous user; **your pid IS your auth uid**. The session (access + refresh token)
  lives in `localStorage.fhq_session_v1` and auto-refreshes. No sign-up, no friction.
- Everything degrades gracefully: without the env vars the game runs fully offline
  against generated rivals.

## Security model (migration `20260705000001_pvp_hardening.sql`)
| Layer | Rule |
|---|---|
| Base writes | RLS: `pid = auth.uid()` — only you can insert/update your row |
| Attack reports | RLS: `attacker_pid = auth.uid()`, target ≠ self, target must exist |
| Sanity bounds | CHECK constraints: trophies ≤ 20k, stars 0–3, pct 0–100, coins ≤ 100k, name ≤ 40 chars, layout < 60KB, replay < 80KB |
| Rate limiting | trigger: max 4 attack reports/min and 30/hour per attacker |
| Reads | public (leaderboard + matchmaking are open data) |

Verified with 9 live negative tests (unauthenticated write, forged pid, insane values,
self-attack, ghost target, rate-flood) — all rejected at the database.

## Env configuration
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
`.env.production` is committed (the anon key is a public client key by design — RLS is
the boundary). `.env.local` for dev. **Anonymous sign-ins must be enabled** on the
project (Dashboard → Auth → Providers → Anonymous, or Management API
`external_anonymous_users_enabled: true`).

## Data flows
- `publishBase` — upsert your layout/trophies on load and after battles (JWT-signed).
- `findOpponents` — 3 bases near your trophy count (±200/+400, widens when empty).
- `reportAttack` — stars/pct/coins + the recorded replay (seed + deploy script + the
  defender's layout as attacked).
- `fetchAttacksOnMe` — new attacks since the `fhq_pvp_since` watermark → defense log,
  with replay and `attacker_pid` (revenge fetches their REAL current base via `fetchBase`).
- `fetchLeaderboard` — top 20 by trophies for Standings → Live Rankings.

## Known limits (be honest)
- Trophy counts are still client-computed (bounded, but not simulation-verified).
  Server-side battle validation is a future project.
- One anonymous identity per browser profile; clearing site data loses it — players
  should use Settings → Export to back up (bundle includes the session).
- Rate limits protect the defender's log, not matchmaking fairness.
