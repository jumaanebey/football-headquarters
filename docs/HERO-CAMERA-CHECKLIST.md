# Hero camera and battlefield readability — September 10, 2026

Baseline: `39bf464`. Presentation work alongside Claude's separate backend/defense/save work. No combat, rewards, persistence or snapshot interfaces changed.

## Implemented

- [x] Optional hero-follow close view and one-tap full-field return in modern battles.
- [x] Follow living attacking or defending heroes; absent/substituted targets restore the overview.
- [x] Restore the overview while selecting a hero, special deployment or field play.
- [x] Camera reads projected coordinates only; existing pointer unprojection reads the transformed field bounds.
- [x] Increase shared modern hero size from 52–88px / 10% to 64–104px / 12%, retaining foot anchors and combat distances.
- [x] Remove modern floating full-name plates; names remain in hero commands and the camera selector.
- [x] Keep commentary, wave banners and momentum outside the zoomed field. Wave announcements take precedence over commentary.
- [x] Reduced-motion preference uses a fixed chosen close-up rather than following, disables camera transition/shake, and listens for preference changes. Full-field return remains available.
- [x] Preserve legacy replay camera transform and existing animation/rules contracts.

## Verification

- [x] TypeScript, 257 tests in 26 files, 529 raster decodes and production build.
- [x] Shared-engine balance gates across 219 matches; engine source unchanged.
- [x] Local narrow phone viewport: deploy Enforcer, choose follow view, use Truck Stick, inspect enlarged art/contact, full-field return, choose another deployment, automatic overview, then deploy Franchise.
- [x] Substituted Enforcer disappears from camera options and no longer holds the camera.
- [x] Announcements remain readable without zoom clipping; hero nameplate no longer covers the contact.
- [ ] Preview and production evidence: record on the associated PR after verification.
- [ ] Physical-phone and reduced-motion interactive acceptance; implementation is not a claim of device testing.

## Still open

Full authored directional/start/turn/reaction/substitution coverage, seven other authored signatures, coherent complete environment/footprint review, renderer benchmark, human playtesting and sustained physical-device performance. This camera improvement does not complete those requirements. Claude owns the authority, defense-contract and save work; editable campus remains a separate coordinated workstream.
