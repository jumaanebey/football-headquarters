// One call from the entry module: arms install capture and connection tracking, registers the
// worker in production, and exposes a read-only inspection object for QA scripts
// (window.__fhqPwa). Nothing here shows UI; see docs/PERF-INSTALL-MILESTONE.md for the
// product hooks Codex wires into Settings.
import { armInstallCapture, installSupport } from './install';
import { armConnectionTracking, connectionState } from './connection';
import { applyUpdate, checkForUpdate, onUpdateAvailable, registerServiceWorker, updateState } from './register';

declare global { interface Window { __fhqPwa?: { install: typeof installSupport; connection: typeof connectionState; update: typeof updateState; applyUpdate: typeof applyUpdate; checkForUpdate: typeof checkForUpdate } } }

let booted=false;
export function bootPwa(options: { register?: boolean } = {}): void {
  if (typeof window === 'undefined' || booted) return;
  booted=true;
  armInstallCapture();
  armConnectionTracking();
  if (options.register ?? import.meta.env.PROD) {
    void registerServiceWorker();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  }
  onUpdateAvailable(() => { /* the product UI subscribes through pwa/register.ts; nothing automatic here */ });
  window.__fhqPwa = { install: installSupport, connection: connectionState, update: updateState, applyUpdate, checkForUpdate };
}
