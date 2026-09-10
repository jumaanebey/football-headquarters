# Online integrity integration — 2026-09-09

These changes protect honest clients against lost replies and stale devices. They do not make client-authored scores authoritative.

## Status update 2026-09-10

The project is ACTIVE_HEALTHY and the authority backend has been recovered and connected; see `docs/AUTHORITY-RECOVERY.md` and `docs/AUTHORITY-CONTRACTS.md`. The section below is the historical note from the inactive period.

## Historical backend blocker (2026-09-09)

The production configuration points to Supabase project `ruzkpbvgzvqrrnexrffz`, named `football-headquarters`. `get_project` returns `INACTIVE`. A read-only schema query timed out. The authorized restore call returned `NotFoundException: Project not found`. No schema, plan, account, or data was changed. The connected project listing does not include this project's organization. Server-authoritative rewards and two-account live checks remain blocked until this existing project is accessible and restored.

## Cloud conflict UI

Import `subscribeCloudWriteStatus`, `acceptCloudRevision`, `CloudSave`, `getCloudWriteStatus` from `pvp.ts`.

1. Add state `cloudConflict: CloudSave | null | undefined`; undefined means no conflict UI, null means the other device deleted its cloud row.
2. Subscribe once to `subscribeCloudWriteStatus`. Display its message on conflict/error/unavailable/invalid, “Saving…” on pending, and confirmed saved status on saved. A conflict must not be described as an offline retry.
3. In `syncWithCloud`, immediately after the fetch-error branch: `if (res.conflict) { setCloudConflict(res.status === 'found' ? res.save : null); return 'conflict'; }`. Extend the return union accordingly. Do not proceed to the old clock comparison or push.
4. Before applying any validated cloud club, call `acceptCloudRevision(cloud.updated_at)` immediately before the successful local save/reload. Put this after the local save succeeds so storage failure cannot approve a different remote base.
5. Conflict actions: **Use cloud club** validates and backs up local progress, writes the cloud save, calls `acceptCloudRevision(cloud.updated_at)`, then reloads. **Keep this device's club** calls `acceptCloudRevision(cloudConflict?.updated_at ?? null)`, then calls the existing `pushSaveToCloud`; another concurrent change returns a fresh conflict. **Cancel** keeps both saves and leaves automatic uploads blocked.
6. Keep cloud-conflict choice and errors visible in Settings. The detailed status API is also available as `pushCloudSaveDetailed`; the original boolean wrapper remains true only after an acknowledged row.

## Raid report UI and retries

`reportAttack` now returns `{ status, operationId, message }`. Pass a stable battle operation UUID as its final optional argument when available. Display the returned message for `pending`, `unconfirmed`, and `rejected`; only `reported` confirms delivery, and it still does not mean server-verified scoring.

Call `retryAttackReports()` once when online auth initializes and when the browser emits `online`. It only retries queued reports owned by the current account and previously unconfirmed reports whose server supports idempotency. `pendingAttackReports()` returns the visible pending/unconfirmed list. The persisted outbox holds at most 20 reports and is never included in portable backups. On the old server, a lost reply stays unconfirmed and is never blindly resent.

## Replace the live defense effect

Import `fetchAttackInbox`, `fetchAttackInboxBaseline`, `playerId` from `pvp.ts`, and `applyAttackInbox`, `defenseCursor`, `establishDefenseInbox` from `game/online/defenseInbox.ts`.

Remove the effect that writes `fhq_pvp_since` before `setGameState`. Replace it with this structure (adapt local online-status presentation):

```tsx
useEffect(() => {
  if (!pvpEnabled()) return;
  let cancelled = false;
  void (async () => {
    await getProfile(); // resolve identity before choosing its cursor
    const owner = playerId();
    let cursor = defenseCursor(stateRef.current, owner);
    if (stateRef.current.defenseInbox?.ownerId !== owner) {
      const baseline = await fetchAttackInboxBaseline();
      if (cancelled || baseline.status !== 'ok' || baseline.playerId !== owner || playerId() !== owner) return;
      setGameState(previous => establishDefenseInbox(previous, owner, baseline.cursor));
      cursor = baseline.cursor;
    }
    for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
      const page = await fetchAttackInbox(cursor);
      if (cancelled || page.status !== 'ok' || page.playerId !== owner || playerId() !== owner) return;
      setGameState(previous => applyAttackInbox(previous, page, owner));
      if (!page.hasMore) return;
      cursor = page.cursor;
    }
  })();
  return () => { cancelled = true; };
}, []);
```

`GameState.defenseInbox` and its save validation are additive and already implemented. The pure helper advances the cursor in the same state value as losses. It remains idempotent after older log entries are trimmed and handles attacks sharing a timestamp by ID. On upgrade or an account change, establish a current server baseline without applying historical losses: trimmed logs and the unowned `fhq_pvp_since` watermark cannot prove which old attacks were already charged. The helper refuses losses until this account baseline exists. Existing logs and balances remain intact; only reports arriving after that baseline apply. Never reuse the unowned legacy timestamp. A page cap is bounded loading; another fetch can resume from the saved cursor.

## Deployment sequence

Ship/test client protections independently. Review `supabase/candidates/online_integrity.sql` against the actual restored schema, generate a proper migration with the Supabase CLI, run advisors, and test two disposable accounts before applying. That candidate adds the unique operation key and server-generated timestamps while preserving existing rows. No existing history or save may be truncated. Full server battle authority is a separate release gate.
