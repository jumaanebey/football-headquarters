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

## Remaining release checks

- [ ] Push the focused repair and open a pull request.
- [ ] Verify preview artwork loads and observe ground integration at starter and upgraded levels and in battle.
- [ ] Merge after the release checks pass.
- [ ] Verify the published campus and served critical atlas hashes.

The local preview could not be reached (`ERR_CONNECTION_REFUSED`). Browser visual acceptance is not passed. The existing production JavaScript size warning remains. A terminal attempt to verify served production bytes did not return decodable images; it does not establish new production hashes.

## Validated source hashes

| Asset | SHA-256 |
| --- | --- |
| Field equipment | `2b8add0775d9ed7dcbb171b6e70e5da86001b3cbfe21d5cfc9a1fa86c0dc854b` |
| Upgraded campus | `ae530c33db423d0a4eb3a66138cd237b4d9ca2460fc5f9dcaa3c5dab6b55d2a2` |
| Grounds | `e9157995ff79aab665f7353a93be5ddd9b7dd17f9a1658c30734b2db027d811e` |
