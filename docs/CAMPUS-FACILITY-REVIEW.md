# Campus, facility and uniform review

The live tab initially ran build 19:55 with an update waiting. Applied the normal Update & reopen action; confirmed build 23:17 and repeated the major navigation checks. Reviewed campus/building sheets, roster-to-scouting, heroes/growth, Game Day/preparation (without reserving a game), defense, standings, program and Settings. Existing user currency and game progress were not spent during review.

## Delivered changes

- Uniform color frames retain their native source dimensions. The previous implementation reduced every frame to 160×160 then enlarged it; this was an avoidable sharpness regression. Static uniform overlays also retain source size. The LRU now evicts by actual byte size (32 MiB cap) plus frame count, rather than reducing detail. Source art and combat rules are unchanged.
- Every facility opens its current benefit, collection/department action and upgrade benefit/cost/progress on the same page. Overview/Upgrade tabs removed. Appearance previews remain secondary. Hiring a builder appears only when all builders are occupied. Landscape uses side-by-side overview and upgrade sections.
- Home-campus framing excludes the detached arrival bay; its parked bus and road are no longer shown in the default overview. Lower facilities sit closer to the practice field; walkways connect to the field perimeter instead of crossing it. Saved defense placements, bus gameplay and parking upgrades are unchanged.

## Rendered acceptance

Isolated fixture dev/campus-review.html uses local component state and makes no account or save writes. All five facility types opened with their upgrade section visible at 390×844; each sheet body fit without scrolling. A simulated stadium upgrade changed preview Coins 2000→600 and showed its timer on the same page. Stadium sheet also fit at 844×390 with body scrollHeight=clientHeight=313. Native-resolution red uniforms reviewed across nine heroes in movement. Shared cache observed 22,544,384 bytes below the 33,554,432 cap. Five-second desktop measurement: 601 samples, p95 8.9ms, zero samples over50ms; not a physical-device benchmark.

The broader review still finds long scrolling content in scouting/hero progression and a utility-style landscape campus. This patch addresses the reported uniform blur, building upgrade click-depth and detached default-map layout; it is not a claim that every game screen is finished or that the map's art direction has final user acceptance.
