# Team uniform palettes

Four selectable uniform colorways now affect all nine heroes, ordinary attackers and defenders, campus heroes and hero cards. Navy cloth and helmet materials adopt the chosen team primary; warm skin, leather, orange details, whites and alpha remain unchanged. This is a material palette system using the existing poses, not new body silhouettes or alternate costumes.

Settings previews two actual uniformed heroes before Apply. Existing device/club-name preferences remain compatible. Opponents use a different palette if their derived palette would match yours. Defender-wide hue rotation was removed so faces retain their original color. Opponent choices are locally derived; personal color preferences are not uploaded to the club server.

Frame coloring uses a shared LRU capped at 192 frames of 160×160 RGBA (18.75 MiB). Original art remains available while a colored layer loads. There are no new art files/downloads; static sprite requests use the same fingerprinted URLs as their originals. The cache clears when battle unmounts. Combat outcomes, authority artifacts and replay hashes are unchanged from PR #63.

Verification: 607 tests/79 files and strict offline release gates pass. Pixel tests cover material separation, alpha, four distinct colors, shading and invalid colors. All nine heroes reviewed at phone width in blue/red idle, green movement and purple contact poses. Nine moving campus heroes: 601 animation-frame samples over five seconds, p95 9 ms, zero frames above 50 ms on this Mac (not a physical-phone performance measurement). Colored frame cache observed at 97/192 while changing styles and poses. Landscape practice rendered Redline attackers and Harbor defenders together (DOM palette IDs and visual inspection). Leaving the completed battle returned the colored-frame cache to zero entries. These fixtures create no accounts and award no resources.

Claude ownership: #62 and #55 PWA, connection and rehearsal files remain untouched. No Claude branches integrated, rewritten or closed.
