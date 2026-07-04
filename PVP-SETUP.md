# Live Rivals (async PvP) — 5-minute setup

The game runs fully offline against generated rivals. Connect a Supabase project and the
Raid tab gains **LIVE RIVALS** — real players' bases, raided asynchronously (their defense
log records your attack; yours records theirs). No accounts, no login: each device gets an
anonymous player id.

## Steps

1. Create a (free) project at [supabase.com](https://supabase.com) — or reuse one.
2. In the project's **SQL Editor**, paste and run `supabase/migration.sql`.
3. In the repo root, create **`.env.local`** (already gitignored):

   ```bash
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your anon public key>   # Settings → API
   ```

4. Restart the dev server (`npm run dev`). Done — your base publishes automatically after
   battles, LIVE RIVALS appear in the Raid tab once other players publish, and incoming
   raids sync into your Defense Log on load.

## What syncs

| Direction | Data |
|---|---|
| **Out** | Your team name, trophies, and battle layout (buildings + Blocking Sleds + tendency boost) |
| **In** | Rival bases near your trophy count; attacks on you (attacker, Game Balls, %, coins) |

## Security honesty

This is **prototype-tier**: writes are anonymous and honor-system (RLS allows public
insert/update). Good for a friends beta; before anything public, move to Supabase Auth +
`auth.uid()`-scoped policies and server-validated attack reports.
