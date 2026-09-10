# Enforcer signature continuation — September 10, 2026

Baseline: `d647c2f` on main. A bounded hero-art/motion slice, not completion of the reconstruction.

## Implementation

- [x] Preserve the existing nine-pose locomotion sheet and approved character identity.
- [x] Add four authored Enforcer poses: ready, load, shoulder contact with tucked forearms, recovery. No outstretched fist or punching.
- [x] Keep one body scale and one ground registration across the four poses; retain editable registration in `game/heroSignatureAtlas.ts`.
- [x] Separate the live activation from contact: activation prepares the stance; physical movement retains run frames; planted ordinary/Truck Stick contact uses authored contact/recovery.
- [x] Prefer run frames over the Enforcer's residual activation timer while he moves, preventing a braced sprite from sliding into contact.
- [x] Remove extra procedural shear/squash from authored Franchise and Enforcer poses; keep procedural fallback for the rest of the cast.
- [x] Preserve simulation movement, yardage, timing, rewards, immutable replay contracts and club saves.
- [x] Retain per-take art selection, late-download safety, reduced-motion idle and existing hidden-tab cleanup.
- [x] Add a local art workbench at `/art/hero-signature-review.html` under Vite, showing original idle, authored frames at 192px and 72px, foot anchor and mirrored facing. It is not part of the production entrypoints.
- [x] Validate actual source decode, keying, clear cell gutters, common scale, foot baseline and bounded rendering in tests.

## Verification

- [x] Local workbench: inspect all eight authored poses for Franchise/Enforcer at both sizes and mirrored facing.
- [x] Local game: Enforcer Film Room, half speed, free practice, deployment, signature, result and retry. Balances remained 100 Energy / 500 Coins / 0 Fans / 10 Crowns during practice (background gate accrual remains separate).
- [x] Final post-fix live sampling: set/load 100/101; contact 102; moving frames 4/5 as position advances; planted contact/recovery 102/103 at fixed coordinates. Vite was restarted because its file watcher did not invalidate a changed module.
- [x] Final typecheck, 255 tests in 25 files, 529 raster decodes and production build. Existing large-bundle warning remains.
- [x] Balance suite: all gates pass across 219 deterministic matches; engine source is unchanged.
- [x] PR #27 remote CI and Vercel preview build passed on `bc13794`. Preview asset SHA-256 matches the reviewed source.
- [x] Deployed preview at 390 × 844: Film Room authored release frame 102; free deployment, Truck Stick load/contact/recovery, run frames 1–6, debrief and retry. No browser errors/warnings observed.
- [ ] Production release verification: results will be recorded on PR #27 after merge.

## Nine-hero coverage and remaining scope

| Hero | Authored signature source | Remaining |
| --- | --- | --- |
| Franchise | Four throw poses, existing | Direction-specific authored cast, start/stop/reaction/substitution |
| Enforcer | Four shoulder-led poses, this slice | Direction-specific authored cast, start/stop/reaction/substitution |
| General, Specialist, Burner, Dr. Sloane, Captain, Playmaker, Legend | One approved contact pose plus procedural anticipation/recovery | Four authored signature poses and full directional/action coverage |

All nine retain the existing six run frames. Mirroring is not independent directional art. This pass does not establish a layered skeletal rig or renderer benchmark. Physical-phone performance, observed-player acceptance, complete campus editing and online authority acceptance remain open. The deployed authority source discrepancy and deferred QA cleanup are outside this presentation-only release.

See `art/enforcer-signature-production.md` for source provenance and reproduction.
