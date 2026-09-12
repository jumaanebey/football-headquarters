# Stadium: four downs, no punts

New clients explicitly request `format: four-downs`. Those games use Stadium rules v3: each kickoff return establishes first and ten (or goal to go), scrimmage plays consume downs, reaching the line to gain resets to first and ten, and a failed fourth down ends that possession. Both teams follow the same drive rules. Field goals may be attempted early; a missed attempt ends the possession. Punts are not offered.

The agreed house format remains two possessions, one per team with its own kickoff, ties allowed. This is not NFL sudden-death overtime. First downs are announced in the recorded event. The panel shows down and distance; blue marks the line of scrimmage and yellow marks the line to gain.

Compatibility: requests from older clients without the format field continue to start v2 games. Existing v2 games resolve through the frozen stadiumFootballV2 module. Original v1 games retain their legacy resolver. Claude's 13 frozen scenarios remain v2 compatibility evidence; new four-down tests cover progression, fourth-down conversion/failure, goal-to-go, both directions, persistence, early kicks and duplicate-action handling in the full journey suite.

Deployment order: deploy authority v10, verify source/artifact parity, then ship the client. Retain v10 on frontend rollback because older authorities cannot settle v3 games. Raid rules, accounts, authentication and database schema are unchanged.

The external audit's soccer-league feature recommendations do not apply to this American-football campus game. The live React app was observed rendering; the claimed blank container was not reproduced. Replace the inline emoji favicon with the existing PNG asset to avoid data-URL sanitization ambiguity. Existing title, description, OG and install metadata remain.
