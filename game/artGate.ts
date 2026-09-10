// Campus art gate: the home campus (facilities, decor, units, campus hero sheets) is not
// requested until the player has finished naming the club. A returning player (tutorial done)
// opens the gate at boot; a new player opens it when the tutorial completes (App calls
// openCampusArt()). A safety timer opens it anyway so a stuck overlay can never leave the
// campus blank, and every loader that awaits the gate keeps its portrait/flat fallback until
// then. Battle art never waits on this gate.
import { TUTORIAL_KEY } from './persistence';

const SAFETY_MS = 25_000;
let opened = false;
let resolveGate: () => void = () => {};
let gate = new Promise<void>(resolve => { resolveGate = resolve; });
let timer: ReturnType<typeof setTimeout> | null = null;

export function openCampusArt(): void {
  if (opened) return;
  opened = true;
  if (timer) { clearTimeout(timer); timer = null; }
  resolveGate();
}
export const campusArtOpen = (): boolean => opened;
export const campusArtReady = (): Promise<void> => gate;

/** Called once from the module that mounts the game. Returning players skip the wait. */
export function armCampusArtGate(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  if (opened || timer) return;
  let done = false;
  try { done = storage?.getItem(TUTORIAL_KEY) === '1'; } catch { done = false; }
  if (done) { openCampusArt(); return; }
  timer = setTimeout(openCampusArt, SAFETY_MS);
}
/** Test hook. */
export function resetCampusArtGateForTests(): void { opened = false; if (timer) clearTimeout(timer); timer = null; gate = new Promise<void>(resolve => { resolveGate = resolve; }); }
