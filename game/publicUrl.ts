/** The one public, crawlable URL of the game. Share cards, canonical links and sitemap entries
 *  all derive from it; player and account state never appear in a URL. */
export const PUBLIC_GAME_URL = 'https://football-headquarters.vercel.app/';
export const PUBLIC_OG_IMAGE = `${PUBLIC_GAME_URL}assets/brand/og-image.png`;
/** A share link with a source tag so the funnel can attribute it (?src=…; see analytics.ts trafficSource). */
export const shareUrl = (source: string): string => `${PUBLIC_GAME_URL}?src=${encodeURIComponent(source.slice(0, 32))}`;
