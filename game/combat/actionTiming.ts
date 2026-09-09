/** Four semantic beats on the combat clock; artwork does not own the timing. */
export function signatureFrameAt(elapsed: number, windup: number, recovery: number): number | undefined {
  if (elapsed < windup * .5) return 0;
  if (elapsed + 1e-9 < windup) return 1;
  if (elapsed + 1e-9 < windup + recovery * .5) return 2;
  if (elapsed + 1e-9 < windup + recovery) return 3;
  return undefined;
}
