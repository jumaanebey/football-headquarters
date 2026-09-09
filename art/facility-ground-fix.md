# Facility ground integration

The four starter facilities had bright grass aprons baked into their sprites. Those aprons did not match the darker campus terrain, especially where its lighting and edge gradients changed. The updated art removes the grass entirely, including between legs and equipment, so the actual campus terrain is visible through the facilities. Existing neutral drop shadows ground their feet.

Production asset: `public/assets/buildings/starter-campus-cutouts.webp`. `BuildingArt` keys its magenta background using the existing shared matte, crops each complete facility, and normalizes the updated sheet to the existing campus scale and foot baseline. The film-room chalkboard remains green; equipment, metalwork, towels, medical kit, flags and roof colors remain intact. Building positions and interactions are unchanged.

Built-in image-generation edit workflow; two passes. Sources were preserved and the final image was encoded as lossless WebP without resizing or recoloring. The first pass returned a rendered checkerboard instead of alpha, so the second pass replaced only that background with a solid matte for the game's existing transparency pipeline.

## Prompts

1. Background extraction: remove all green grass ground/aprons beneath and between the four facility feet and the magenta backdrop. Preserve all facilities, their equipment, green tactical chalkboard, camera angle and 2x2 sheet composition. Request transparent background, no replacement floor or base.
2. Precise background edit: replace the entire white/gray checkerboard, including openings and shadow regions between objects, with uniform chroma-key magenta #ff00ff. Keep all four facilities and all opaque objects intact. No grass, platforms, floor, or tiles; protect the green chalkboard and white/gray equipment.

The published game, rather than the magenta source sheet, is the visual acceptance surface.

## Remaining scenery and terrain

The follow-up removes the separately colored campus diamond and its white light pool. One continuous ground plane now uses `TURF.dark`, the same base as `FieldPaint`; only the field's mowing stripes and the distant vignette vary. This removes the hard color edge beneath the rehab and training facilities.

The starter stadium's olive turf is replaced by emerald turf in `public/assets/buildings/stadium-1-emerald.webp`. The tailgate tent's lime grass slab is removed in `public/assets/decor/tailgate-tent-cutout.webp`, including the gaps between fans, chairs and tent posts. `MatteSprite` reuses the existing chroma-key treatment, caches each sheet, and preserves the square scenery framing. All existing campus locations and hitboxes remain unchanged.

Both edits used the built-in image tool; original sources remain available. New assets are lossless WebP encodings of the generated pixels.

Prompts:
- Stadium: preserve the small football stadium, isometric perspective, fence, gate, bleachers, goalposts, lights, markings and square framing. Change only olive grass to dark natural emerald turf with dominant midtone #245d37 and restrained texture. Keep white lines and structure colors; replace the surrounding backdrop with solid #ff00ff for game keying. No added or removed objects.
- Tailgate: remove only the lime grass floor and tufts beneath/between the tent poles, fans, chairs, grill and cooler. Replace the ground and backdrop with solid #ff00ff. Preserve the black/orange tent, emblem, furniture, fans, lights and original perspective. No replacement floor, tile, shadow pad or checkerboard.
