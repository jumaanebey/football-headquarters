# Live Rivals — PvP setup & security model

> Updated 2026-09-09. The existing Supabase project is currently `INACTIVE`; its authorized restore attempt returned `Project not found` through the connected account. Online verification is blocked. See `docs/ONLINE-INTEGRATION.md` for client protections, exact status, and the unapplied SQL candidate.

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

Historical notes recorded 9 negative tests against the earlier deployment. Those results are not current verification: the inactive database could not be queried during the 2026-09-09 work.

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
- `reportAttack` — validated replay and client-reported result, saved to an account-owned outbox. Delivery is explicitly reported as delivered, pending, unconfirmed, or rejected. Unique operation keys allow safe retries only after the additive server migration is verified and applied.
- `fetchAttackInbox` — owner-bound `(created_at,id)` cursor persisted atomically with defense consequences. A first upgrade establishes the newest server baseline without repeating unverified historical losses. Replays are validated before playback.
- `fetchLeaderboard` — top 20 by trophies for Standings → Live Rankings.

## Known limits (be honest)
- Trophy counts are still client-computed (bounded, but not simulation-verified).
  Server-side battle validation is a future project.
- One anonymous identity per browser profile; clearing site data loses guest identity. Link an account for identity recovery. Portable exports contain club progress only and deliberately exclude sessions and credentials.
- Rate limits protect the defender's log, not matchmaking fairness.
