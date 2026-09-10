# Main campus layout — September 10, 2026

The management overview now arranges five departments around one practice lawn. It replaces the separate historical road, parking texture, moving-car lanes, scoreboard and crowd placements that could overlap each other or block facilities. One parked bus occupies a marked arrival bay connected to an access drive and campus walkway. Fan amenities stay at the perimeter.

Short landscape screens use one separated row of departments. The grass backdrop no longer exposes an artificial diamond when the camera fits a short screen. Portrait and desktop keep the central-lawn composition.

## Interaction

- Both facility artwork and entrance labels open the corresponding department.
- Artwork hit regions come from the loaded alpha silhouette, excluding transparent atlas padding. Entrance labels follow the visible base rather than an unrelated grid offset.
- The campus uses non-scrolling clipping. Restoring keyboard focus cannot silently scroll its hidden overflow and move buildings or controls off-screen.
- A pan captures the pointer after the movement threshold. Pan/pinch tails cannot become building or hero clicks, and releasing beyond the board cannot leave a stuck gesture.
- Facilities and View are the two board controls. Camera controls close after an action. The layout editor lives in Facilities.
- The introductory pointer stops after the first campaign clear; ongoing guidance remains in the checklist.
- The checklist opens as a dismissible sheet; it cannot persist as a card covering half the campus.
- Training, scouting and upgrade status appear under their department labels. The explicit stadium collection button follows the stadium and retains a 44 CSS-pixel target when zoom changes.

## Saved arrangements

No saved coordinates, authority rules, combat geometry or economic rules change. The default management overview is a display layout. Clubs with a saved arrangement can select **View → View saved arrangement**, and return with **Campus overview**. Entering the layout editor selects the saved view; applying and closing it shows the saved placement. The tighter saved grid uses smaller artwork and omits the decorative field if a facility occupies it.

## Verification

The rendered fixture uses the actual IsometricMap, BuildingArt, TopHUD and ObjectiveBanner with synthetic club data and no account creation. Checked starter, middle and maximum facility eras; low/high fan counts; saved arrangements; and busy states with training ready, a recruit ready, an upgrade and stored stadium coins.

At 320×740, 390×844, 844×390 and 1440×900, checked composition and department targets. All five bodies and five labels opened the correct facility in the tested starter, middle, maximum and landscape views. Additional checks covered keyboard opening, pan tails, release beyond the board, zoomed selection, recenter, checklist dismissal, the saved-arrangement toggle and collection callback. Following pan/zoom/modal focus restoration, the campus scrollLeft/scrollTop remained zero and Facilities stayed at x=12.

Transparent-corner checks: Scouting's empty corner over the Stadium opened the Stadium; an empty corner over grass opened no dialog. This directly checks that the old invisible rectangle no longer steals nearby taps.

The full app and production deployment checks are recorded in the release handoff. Physical touch-device acceptance remains distinct from the in-app browser checks.

Full-app preview: existing protected Campus QA FC opened all five real department panels, entered Facilities → Edit campus, canceled without changing the saved layout, returned to Campus overview, and opened/dismissed the checklist. Resources remained 878 Coins, 92 Fans and 28 Crowns. No new account or gameplay mutation.
