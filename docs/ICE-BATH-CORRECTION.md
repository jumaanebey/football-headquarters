# Ice-bath art correction — 2026-09-11

The four cold-plunge player variants are shirtless and seated against the image-left end of the tub, with open blue water on the right. The foreground canopy post still layers above the bath without covering the player's face. The room layout is unchanged.

The revised bottom row is packaged in indoor-recovery-v2.webp with the existing 256-pixel bounds. Foam-rolling and hydration frames were preserved and verified byte-identical after decoding. The new lossless atlas is 773,410 bytes. The cold-plunge pose bypasses team-kit recoloring so skin, water and metal retain their authored colors. Other activities keep the selected team colors.

Built-in image generation used the approved recovery atlas and Rehab room as references. Exact prompt: ICE-BATH-ART-PROMPT.json. Original generated output retained as exec-14432f03-109a-40f6-9899-0a565a1c2a08.png in the session's image-generation directory.

Validation: strict offline release verification passed, including 655 tests in 86 files, typecheck, atlas/raster checks, authority parity, restore rehearsal, production build and balance. Native browser inspected the room at 1126×800 and 390×844 with the red team kit; no browser errors. Optional headless/offline and live-account mutation suites were skipped. No gameplay, resource, authority or save change.
