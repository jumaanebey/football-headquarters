# Room/player continuity and visible rewards

This release addresses the player's complaint that the room environments and characters look like separate games. It preserves the approved room illustrations and uses a new set of practice athletes in the Weight Room, its followed-player panel, and Scouting. The four position groups have authored body types and standing/lifting poses, with elevated perspective, warm light, team-colored shirts, floor anchors and contact shadows. No helmets or tackling poses inside those rooms.

The Weight Room states which group is inside and how many teammates that represents. Choosing another player brings that group into view when idle. During an active workout, the room continues to show the real participants. Up to six are visible; additional participants are disclosed. Actual roster identities, training timing and rewards are unchanged. Workout motion uses two authored lift poses, stops when the session ends, observes reduced motion, and stops work for hidden/off-screen consumers. This is not a walkable interior or a unique portrait for every roster member.

The shared indoor atlas is 1,246,826 bytes, lossless WebP, loaded on indoor-player mount with one shared decode. It is content-hashed by Vite and not added to startup precache. It has a production magenta matte, keyed by the renderer with edge cleanup; the rejected generated checkerboard is not shipped. Native-resolution player canvases retain their detail through the existing uniform tint path. The 12 frame bounds are verified against actual raster pixels, including transparent top/bottom margins and preserved skin/cloth colors. The source environment art is unchanged.

## Results correction

The review reported that skipping the celebration returned directly to campus. Code inspection found that an existing result card could be dismissed through backdrop click, Escape, or its close button, all of which called the reward handler. This release makes progression results require an explicit footer action. Celebration now says “View game result,” and its action only reveals that card. The battle-header exit is disabled after the whistle. The result-viewed milestone fires when the card becomes visible, not when the celebration starts.

The card also previews Crowns, first-clear hero shards and trophy movement alongside Coins/Fans. Owned campaign/gauntlet history prevents repeat first-clear previews; trophy losses clamp at the club's existing trophies. Server-backed matches label amounts as previews pending confirmation. Practice and replay remain dismissible and award nothing. No authority bundle or economic rules changed.

## Verification

- Strict offline release: 648 tests / 83 files, typecheck, authority parity, hero atlas checks, restore rehearsal, raster decode, production build, hashed assets and balance guard passed. Optional Chrome/offline/live-account suites were explicitly skipped.
- Native isolated workout: 15 Energy paid, three offensive linemen alone grew L1→L2 and 110 Coins were collected; authored lift poses were inspected while active. The player selector retained the actual unit group.
- Native phone renders: all four group designs in the current Redline kit; Weight Room and Scouting entry bodies fit at 319×811 (712/712). Scouting at the same width uses the standing prospect pose at the desk, not old battle art. Also inspected gym at 390×844 and desktop.
- Native full celebration journey at 1126×711: deploy → win → View game result → visible 693 Coins, 21 Fans, 12 first-clear Crowns and 14 General shards. Escape and double backdrop click retained the card; Collect rewards alone reached the fixture completion marker.
- Reward preview tests compare against real settlement for raid, loss, campaign first/repeat clear and gauntlet first/repeat clear. Practice and replay previews remain empty.

## Review boundaries

The remainder of the pasted review remains a backlog, not a claim of completion: rating hierarchy, navigation naming, readiness consistency, combat HUD sizing, energy-charge observation, progression pacing, unique roster identities, standings density, equipment presentation, opponent crests, trait pools, Program and Hero gallery structure. Film/Stadium/Rehab interiors have no new simulated occupants. This release does not assert that those systems have been rebuilt or physically tested on iOS/Android.

Art mode and complete prompts: `docs/INDOOR-PLAYER-PROMPTS.json`. Project assets: `art/players/indoor-atlas-v1.webp` and `.json`. Built-in image_gen generated the artwork and matte revision; packing encodes the source without repainting it, and runtime rendering performs compositing.
