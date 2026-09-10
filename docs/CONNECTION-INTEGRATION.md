# Connection integration and PR reconciliation

PR #62 is merged as df3bf75711d278192222f6a71ce4d05c5313009f, not waiting for review. Its native kill-switch and two-version evidence remains in docs/MAIN-VERIFICATION.md.

Session reads and successful identity changes now reset connection diagnostics when the owner changes; repeated reads and same-owner refreshes preserve observations. Authority HTTP 500–599 responses are reached-but-unavailable, including non-JSON maintenance responses. HTTP 401/403 is expired authorization. A response completing after the active owner changes cannot overwrite the new account's diagnostics. Pending operation semantics are unchanged.

Regression coverage exercises sign-in, sign-out, repeated same-owner reads, HTTP 500/502/503 without JSON, and an old-account response arriving after sign-in to a different account.

## PR #55 disposition

Keep open. Its connection module is already on main via #62, while current main has independently implemented worker/update protection and native rehearsal coverage. Do not merge its older worker implementation wholesale.

Still additive: game/funnel.ts supports account-scoped markers, distinct upgrade_requested/upgrade_meaningful events and backup methods; scripts/funnel-report.mjs and its declaration/tests distinguish requested versus completed upgrades, backup methods and malformed rows. Those differences were verified against current main. Connection integration alone does not supersede this reporting work. Preserve Claude's branch for selective integration and coordinated App call sites.

## External acceptance

No service-role credential is present in this process or this checkout's .env.local (checked for presence only; no secret printed). A real funnel report cannot be claimed. Physical iOS/Android installation acceptance requires those devices. The derived battle-art figures remain a proposal; no original art replaced and no approval asserted by this patch.
