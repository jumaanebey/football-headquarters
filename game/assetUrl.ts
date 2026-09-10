// Content-addressed URL for a shipped asset. Canonical paths (`/assets/heroes/elite/qb.webp`)
// stay the identity used in data, films and tests; only the request URL changes, and only in a
// production build where build/fingerprintAssets.ts filled the manifest. Unknown paths pass
// through unchanged, so a missed entry degrades to the fixed URL rather than a broken image.
import manifest from 'virtual:fhq-asset-manifest';

export const assetUrl = (path: string): string => manifest[path] ?? path;
export const isFingerprinted = (path: string): boolean => path in manifest;
export const assetManifestSize = (): number => Object.keys(manifest).length;
