# Hero and campus production art

Nine heroes share one sculpted, black/navy and orange visual direction. Every sheet was generated with imagegen against canonical character references, reviewed, and corrected for alternating foreground limbs, missing gear, and matte artifacts. The final sources are shipped as lossless WebP in `public/assets/heroes/elite`.

Each 1254 × 1254 source has nine poses: idle, six run phases (left contact/pass/flight then right contact/pass/flight), signature, celebration. `game/heroAtlas.ts` records full foreground bounds, including poses crossing nominal cells. `AnimatedHero` removes the magenta matte once, normalizes all frames to one actor scale, anchors the torso horizontally and the feet vertically, and caches the resulting canvases. Stride phase survives cadence changes; hidden tabs pause and reduced-motion mode holds idle. Cards, campus actors, film room, both battle teams, and ability callouts share these assets.

Four starter facilities use the same art direction and keying in `BuildingArt`: film room, scouting tent, rehab tent, and equipment shed. Later building eras retain their progression art. Stadium and campus anchors remain the existing layout, with a larger marked practice field, continuous perimeter paths, and a wider default camera.

Generated-source prompts are archived in `hero-elite-prompts.txt`. Production source sheets preserve the generator pixels apart from lossless format encoding. The six-phase gait intentionally avoids arm/leg puppet overlays.

`/device-preview.html` is an unlinked responsive-review harness. Its iframe renders the real game at 390 × 844, 768 × 1024, or 1363 × 936, with no unlock, currency or combat overrides.
