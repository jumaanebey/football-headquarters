# Campus composition and tap verification

The home campus now uses a taller composition on portrait phones and two department wings around the stadium and practice field on wide screens. This is presentation geometry only; saved defense placements and match rules are unchanged.

- The collection target sits above the stadium silhouette instead of covering its roof. Keyboard collection feedback uses the button center.
- Portrait departments move closer to the centerline and use the available height.
- Landscape retains the practice field and heroes, instead of a five-building row. Desktop uses this wider composition too.
- Framing includes the practice field perimeter, not just buildings, so the lawn stays above navigation.
- Narrower pedestrian paths connect to the field perimeter. Existing tree art frames the portrait campus; no roads or traffic were added.
- Facility art and labels retain the same first-tap overview/upgrade page.

## Rendered verification

Used the isolated `/dev/campus-review.html` fixture, which does not import the app or create an account. `?level=5` exercises upgraded appearances. Its collection callback now credits the fixture balance and removes the collection control.

Verified level-one art taps at 319×811; all ten art/label taps at 390×844 and 844×390; level-five art taps at 319×811 and 1440×900; all ten level-five art/label taps at 667×375. Every result was checked against the opened facility title. At 390×844 all five facility pages had zero body overflow. Collection changed 2,000 to 2,300 and removed the collection target.

The first compact landscape revision exposed upper labels intercepting lower art. The final geometry moves upper departments inward, separating those touch regions. All ten compact-landscape targets then opened the correct facility.

Strict offline release verification passes, including typecheck, 630 tests, authority parity, art checks, build and balance. Headless Chrome could not launch under this session's sandbox; rendered checks used the available in-app browser instead. These are browser viewport checks, not physical-device acceptance. No live player resources were spent.
