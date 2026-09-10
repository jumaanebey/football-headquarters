# Club identity preview

Codex ownership: components/ClubStyle.tsx and dev/club-identity.*. Claude retains PWA, connection diagnostics, funnel, and their test scripts. No Claude branch was merged, rewritten, or closed in this change.

Four original SVG crest marks distinguish the existing palettes: Harbor waves, Redline chevrons, Evergreen tree, Night lights lightning. The same mark appears in the HUD and Settings preview, with club initials. No additional asset requests.

Settings previews the crest and campus end-zone colors before applying. Cancel restores the current appearance; Apply persists through reload and announces confirmation. The existing device/club-name preference key is preserved. Uniforms, enemy kits and full environment skins are not implemented by this change.

Verification: 595 tests and strict offline release verification passed. Rendered the actual component in the isolated dev fixture at 390px and 320px. Selected a draft without changing the applied marker, canceled, applied Redline, observed the HUD crest change, and reloaded to confirm persistence. At 320px, document scroll width equals viewport width (320); all controls fit. No production account or resources were changed. Storage-denial messaging is implemented but was not browser-injected. Full installed-device acceptance remains open.
