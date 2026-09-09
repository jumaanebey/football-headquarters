# Facility ground integration

The four starter facilities had bright grass aprons baked into their sprites. Those aprons did not match the darker campus terrain, especially where its lighting and edge gradients changed. The updated art removes the grass entirely, including between legs and equipment, so the actual campus terrain is visible through the facilities. Existing neutral drop shadows ground their feet.

Production asset: `public/assets/buildings/starter-campus-cutouts.webp`. `BuildingArt` keys its magenta background using the existing shared matte, crops each complete facility, and normalizes the updated sheet to the existing campus scale and foot baseline. The film-room chalkboard remains green; equipment, metalwork, towels, medical kit, flags and roof colors remain intact. Building positions and interactions are unchanged.

Built-in image-generation edit workflow; two passes. Sources were preserved and the final image was encoded as lossless WebP without resizing or recoloring. The first pass returned a rendered checkerboard instead of alpha, so the second pass replaced only that background with a solid matte for the game's existing transparency pipeline.

## Prompts

1. Background extraction: remove all green grass ground/aprons beneath and between the four facility feet and the magenta backdrop. Preserve all facilities, their equipment, green tactical chalkboard, camera angle and 2x2 sheet composition. Request transparent background, no replacement floor or base.
2. Precise background edit: replace the entire white/gray checkerboard, including openings and shadow regions between objects, with uniform chroma-key magenta #ff00ff. Keep all four facilities and all opaque objects intact. No grass, platforms, floor, or tiles; protect the green chalkboard and white/gray equipment.

The published game, rather than the magenta source sheet, is the visual acceptance surface.
