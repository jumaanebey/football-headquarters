# Weekly funnel reconciliation

The owner supplied a successful real REST report: 19 IDs, 354 events, zero tutorial events and seven returning-player flags. These aggregates are not raw event rows and cannot be recomputed locally. No runtime credential is retained.

Root causes and changes:
- Existing tutorial_choice is now a supported legacy tutorial-completion signal. App already emits direct naming/tutorial milestones; historical zeros were not proof of abandonment.
- Raid menu opens and campaign selection no longer imply actual kickoff. The existing onKickoff direct milestone is authoritative.
- Return counts require activity on distinct UTC days in available history. session_start returning=true only means an existing saved club. D1/D7 wait for complete UTC days; future rows cannot mature a cohort.
- Claude #55 reporting and funnel changes are selectively integrated: malformed-row counts, explicit fixture labeling, runtime-only --no-dotenv, request/completion distinctions, separate file/account backup markers. Existing account-prefixed productFunnel storage remains intact.
- App emits upgrade-request milestones alongside accepted upgrades; growth observations remain completion-only. Settings backup exposure is counted. Account backup requires a confirmed cloud write/read or an available protected club with an email, not merely an email field.
- Three v5 evidence IDs added to the existing 13 documented QA IDs. Explicit qa=true excludes that identity's other rows too. Unknown identities are not guessed to be testers; zero exclusions does not imply zero test traffic.
- Main's bounded date window, deterministic REST pagination order, completed-day cohorts and mixed-source logic are retained. Independent milestone totals are not presented as ordered conversion rates. Result-without-reward means a missing event in the window, not a failed server settlement.

Claude's worker/update files and branch remain untouched. #55 remains preserved; this PR selectively consumes its additive reporting work rather than merging its older worker implementation. Physical acceptance and approved battle-art implementation are separate workstreams.

Validation: targeted report/funnel/product tests plus strict offline release verification; synthetic report evidence is explicitly labeled. Real data needs a fresh owner runtime execution; the prior 19/354 aggregate is not fabricated into corrected counts.
