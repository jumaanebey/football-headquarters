export function heroKeyForPresentation(actor: { heroKey?: string; guardArt?: string }) {
  return actor.heroKey ?? actor.guardArt?.match(/heroes\/(\w+)\.(?:webp|png)$/)?.[1];
}
export type ScreenActor = { x: number; y: number; depth: number };
/** Fade only structures in front of a hero whose body intersects their artwork. */
export function buildingObscuresHero(building: ScreenActor & { width: number }, heroes: ScreenActor[]) {
  return heroes.some(hero => hero.depth < building.depth &&
    Math.abs(hero.x - building.x) < building.width * .43 + 2 &&
    hero.y > building.y - building.width * .62 &&
    hero.y - 5 < building.y + building.width * .25);
}
export function visibleBattleEffects<T extends { type: string }>(effects: T[], reduced: boolean): T[] {
  // Keep score events; bound repeated damage labels and cosmetic bursts in a scrum.
  const score = effects.filter(f => f.type === 'yards');
  const other = effects.filter(f => f.type !== 'yards' && (!reduced || f.type === 'dmg'));
  return [...other.slice(reduced ? -3 : -20), ...score.slice(-3)];
}
export function moveBattleCursor(point: { x: number; y: number }, key: string) {
  const delta: Record<string, [number, number]> = { ArrowLeft: [-5, 5], ArrowRight: [5, -5], ArrowUp: [-5, -5], ArrowDown: [5, 5] };
  const d = delta[key];
  return d ? { x: Math.max(0, Math.min(100, point.x+d[0])), y: Math.max(0, Math.min(100, point.y+d[1])) } : point;
}
