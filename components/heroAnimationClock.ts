/** One cosmetic clock for every mounted hero. Simulation/event clocks stay independent. */
const listeners = new Set<(time: number) => void>();
let frame = 0;
function tick(time: number) {
  frame = 0;
  if (document.hidden) return;
  for (const listener of listeners) listener(time);
  if (listeners.size) frame = requestAnimationFrame(tick);
}
function visibility() {
  cancelAnimationFrame(frame); frame = 0;
  if (!document.hidden && listeners.size) frame = requestAnimationFrame(tick);
}
export function subscribeHeroAnimation(listener: (time: number) => void) {
  if (!listeners.size) document.addEventListener('visibilitychange', visibility);
  listeners.add(listener);
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      cancelAnimationFrame(frame); frame = 0;
      document.removeEventListener('visibilitychange', visibility);
    }
  };
}
