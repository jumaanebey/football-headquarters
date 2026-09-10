// One call from the entry module: arms install capture and connection tracking, registers the
// worker in production, and exposes a read-only inspection object for QA scripts
// (window.__fhqPwa). Nothing here shows UI; see docs/PWA-RELIABILITY.md for the product hooks
// (readiness provider, update banner, connection row) Codex wires into App.tsx and Settings.
import { armInstallCapture, installSupport } from './install';
import { armConnectionTracking, connectionState } from './connection';
import { applyUpdate, checkForUpdate, onUpdateAvailable, registerServiceWorker, registerUpdateReadiness, retryDeferredUpdate, sayHello, updateReadiness, updateState } from './register';

declare global {
  interface Window {
    __fhqPwa?: {
      install: typeof installSupport; connection: typeof connectionState; update: typeof updateState;
      /** Refused unless the registered readiness provider (or the app) says the game is idle. */
      applyUpdate: typeof applyUpdate; retryDeferredUpdate: typeof retryDeferredUpdate; checkForUpdate: typeof checkForUpdate;
      readiness: typeof updateReadiness; registerUpdateReadiness: typeof registerUpdateReadiness;
    };
  }
}

export function bootPwa(options: { register?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  armInstallCapture();
  armConnectionTracking();
  if (options.register ?? import.meta.env.PROD) {
    void registerServiceWorker();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { void checkForUpdate(); sayHello(); } });
  }
  onUpdateAvailable(() => { /* the product UI subscribes through pwa/register.ts; nothing automatic here */ });
  window.__fhqPwa = { install: installSupport, connection: connectionState, update: updateState, applyUpdate, retryDeferredUpdate, checkForUpdate, readiness: updateReadiness, registerUpdateReadiness };
}
