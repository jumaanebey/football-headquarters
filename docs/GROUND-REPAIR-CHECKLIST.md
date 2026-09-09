# Ground asset repair — September 9, 2026

Scope: correct the remaining green bases in the published game. Baseline: `9c525dc` on `main`. Branch: `gpt/repair-ground-atlases`. The unreleased reconstruction branch remains separate.

## Confirmed cause

The live campus showed 14 instances of `grounds-cutouts.webp` with `data-ready="0"`, so `MatteSprite` displayed the older sprites and their grass bases. The starter facilities and stadium cutout reported ready. Three atlases on the published source branch were truncated near 600 KB; their WebP headers described longer files. Header/existence checks did not detect this failure.

## Completed

- [x] Inspect the live campus and identify the fallback artwork.
- [x] Confirm the remote baseline remains `9c525dc`.
- [x] Isolate this repair from unreleased combat and progression changes.
- [x] Restore field equipment from the intact 1,393,640-byte atlas.
- [x] Restore upgraded facilities from the intact 1,569,608-byte atlas.
- [x] Restore scenery from the intact 926,264-byte atlas.
- [x] Preserve the shared field colors, floorless art mappings, saved layouts, and existing contact shadows.
- [x] Add full pixel decoding and WebP length validation to `npm run build` through `prebuild`, including the Vercel build path.
- [x] Add the regression case for the exact truncation class that reached production.
- [x] Add type checking to CI and retain the existing balance gate.
- [x] Pass `npm run check`: TypeScript, 83 tests in 14 files, 527 raster decodes, production build.

## Release verification

- [x] Publish the exact validated tree through the connected GitHub app and open PR #22.
- [x] Confirm GitHub CI passes on repair commit `726aec4` and Vercel preview reports Ready.
- [x] Inspect the preview campus: all 14 scenery instances report ready and no longer display the old grass bases.
- [x] Inspect the preview battle: the repaired field-equipment sheet reports ready and its structures render on the field.
- [x] Verify the served upgraded-campus sheet decodes in the browser at 1254 × 1254 pixels.
- [x] Merge PR #22 as `b4a1f0c` and confirm the production Vercel deployment succeeds.
- [x] Refresh https://football-headquarters.vercel.app/ and visually verify the repaired campus; all 14 scenery instances, the stadium cutout, and the tailgate cutout report ready.
- [ ] Independently compare HTTP-served asset SHA-256 values (source blob hashes were verified; browser decoding and rendering passed).
- [ ] Complete an in-scene review of every upgraded construction era; the restored sheet decodes, but those progression states were not individually exercised in this repair.

The local preview connection was unavailable. Visual verification was completed on the Vercel preview and production site instead. The existing production JavaScript size warning remains. No claim is made about independent HTTP-served hashes or every upgraded progression state. The broader reconstruction is not part of this repair.

## Validated source hashes

| Asset | SHA-256 |
| --- | --- |
| Field equipment | `2b8add0775d9ed7dcbb171b6e70e5da86001b3cbfe21d5cfc9a1fa86c0dc854b` |
| Upgraded campus | `ae530c33db423d0a4eb3a66138cd237b4d9ca2460fc5f9dcaa3c5dab6b55d2a2` |
| Grounds | `e9157995ff79aab665f7353a93be5ddd9b7dd17f9a1658c30734b2db027d811e` |
