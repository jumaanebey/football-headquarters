// Install helpers for the product UI. No automatic prompt: the browser's install event is
// captured and held until the UI decides to offer it after a meaningful moment. iOS has no
// event, so the helper returns manual instructions instead. Nothing here assumes support.
export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'unsupported';
export interface InstallSupport { platform: InstallPlatform; installed: boolean; canPrompt: boolean; manualInstructions: string | null }
interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(support: InstallSupport) => void>();
let armed = false;

export const IOS_INSTRUCTIONS = 'On iPhone or iPad: open this page in Safari, tap Share, then "Add to Home Screen".';

export function detectPlatform(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent, hasSw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator): InstallPlatform {
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'ios';
  if (!hasSw) return 'unsupported';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}
export function isInstalled(): boolean {
  try { return (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true); } catch { return false; }
}
export function installSupport(): InstallSupport {
  const platform = detectPlatform(), installed = isInstalled();
  return { platform, installed, canPrompt: !!deferred && !installed, manualInstructions: platform === 'ios' && !installed ? IOS_INSTRUCTIONS : null };
}
/** Capture the browser's install event (idempotent). Call once at startup; never prompts by itself. */
export function armInstallCapture(target: Pick<Window, 'addEventListener'> | null = typeof window === 'undefined' ? null : window): void {
  if (armed || !target) return; armed = true;
  target.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as BeforeInstallPromptEvent; notify(); });
  target.addEventListener('appinstalled', () => { deferred = null; notify(); });
}
export function onInstallSupportChange(listener: (support: InstallSupport) => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
const notify = () => { const s = installSupport(); for (const l of listeners) { try { l(s); } catch { /* never break the page */ } } };
/** Show the browser's install prompt (Android/desktop Chromium only). Returns the outcome, or 'unavailable'. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred; if (!event) return 'unavailable';
  deferred = null;
  try { await event.prompt(); const { outcome } = await event.userChoice; notify(); return outcome; } catch { notify(); return 'unavailable'; }
}
/** Test hook. */
export function resetInstallForTests(): void { deferred = null; armed = false; listeners.clear(); }
