# Enforcer four-pose source

Generated with built-in imagegen, using `public/assets/heroes/elite/enforcer.webp` as the identity reference. The original nine-pose asset is preserved. Final source lives in `public/assets/heroes/signatures/enforcer.webp`, a lossless encoding of the corrected generator output. The runtime uses the existing magenta keying path; no hand-cut limbs or new puppet overlays.

The initial output painted a checkerboard instead of alpha. It was rejected. A second imagegen edit replaced only the background with the established magenta matte. The accepted contact keeps both forearms against the torso and leads with the shoulder pad; the earlier punching prototype remains rejected.

## Prompt

Create a production sprite sheet for the SAME Enforcer football running back in the reference, preserving exactly his face, helmet, orange shield badge, muscular broad build, oversized black shoulder pads, black gloves, orange socks, black cleats and black/orange uniform. This is a four-pose signature sequence, replacing ONLY the pose layout with a 2 by 2 grid of four full-body images on a genuinely transparent background. No labels, no text, no ground, no shadow, no effects, no lines or separators. Each character isolated with generous clear margins within its quarter of the sheet, no overlap. Camera and body facing match the reference: three-quarter toward viewer LEFT. Same body proportions and pixel scale in every cell; crouched poses are shorter, never resized to fill the cell. Bottom of cleats on identical local baseline in all cells. Top-left SET: the same upright ready stance from reference top-left, hands empty at sides. Top-right LOAD: athletic slight knee bend, hips low, shoulder pads rotate modestly forward, both elbows bent and forearms tucked inside the torso silhouette, head up and eyes forward. Bottom-left CONTACT: unmistakable football shoulder-led truck/block pose, feet braced wide on turf, knees bent, chest leans forward toward viewer-left, leading shoulder pad bears contact, both forearms folded tightly across the torso below pads with hands close to chest. NO outstretched fist, no punch, no straight arm, no weapons, no ball. Keep helmet up, no head-first contact. Bottom-right RECOVER: rise from the brace, weight returns over hips, shoulders opening back toward original ready stance, elbows relax downward; both cleats still planted. High-quality polished cel-shaded game art matching the reference's linework, lighting, texture and character identity. Output square transparent PNG, four distinctly authored poses.

## Corrective edit prompt

Edit this exact four-pose Enforcer sprite sheet. Change ONLY the checkerboard background to perfectly flat solid saturated magenta #ff00ff, the existing game's chroma-key pipeline needs this. Preserve every character exactly: face, equipment, poses, body proportions, color, scale, position and all four cell locations. No checkered pattern anywhere, no ground shadows, no halo, no transparency visualization. Preserve clean black outer character outlines. Do not add a ball or any object. Square 2x2 sprite atlas.

## Editable production method

1. Preserve the lossless source sheet; pose edits use it and the original character as references.
2. Adjust per-pose horizontal root anchors in `HERO_SIGNATURE_ATLAS`. Bounds are measured from keyed pixels; every pose shares one scale and the 370/384 ground line.
3. Run `npm run dev`, open `/art/hero-signature-review.html`, and compare the source poses with original idle at 192px and 72px, facing both directions.
4. Run the actual-raster test in `tests/heroSignatureAtlas.test.ts`. A painted transparency background, bleed across cell gutters, or a malformed sheet must fail.
5. Verify Film Room and free practice. Never change gameplay timing to conceal an art problem. Live Enforcer activation stays in Set/Load, distance-driven run frames continue during the drive, and the existing planted contact timer selects Contact/Recover.
6. The same approach is available for the other seven heroes; full directional start, run, reaction and substitution remain separate asset work.
