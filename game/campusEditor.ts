import { BUILDING_INFO, buildingTiles } from '../constants';
import type { CampusLayout } from './campusLayout';

export type CampusItem = { key: string; name: string; gridX: number; gridY: number; size: number };
export function campusItems(layout: CampusLayout): CampusItem[] {
  return [
    ...layout.facilities.map(p => ({ ...p, key: `facility:${p.id}`, name: BUILDING_INFO[p.type].name, size: 2 })),
    ...layout.slots.map(p => ({ ...p, key: `slot:${p.id}`, name: `${p.id} · ${p.kind}`, size: 1 })),
    ...layout.walls.map((p, i) => ({ ...p, key: `wall:${i}`, name: `Wall ${i + 1}`, size: 1 })),
    ...layout.gates.map(p => ({ ...p, key: `gate:${p.id}`, name: p.label, size: 1 })),
    { ...layout.bus, key: 'bus', name: 'Team bus', size: 1 },
  ];
}
export function moveCampusItem(layout: CampusLayout, key: string, gridX: number, gridY: number): CampusLayout {
  const [kind, id] = key.split(':');
  const position = { gridX, gridY };
  if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) return layout;
  if (kind === 'facility') return { ...layout, facilities: layout.facilities.map(p => p.id === id ? { ...p, ...position } : p) };
  if (kind === 'slot') return { ...layout, slots: layout.slots.map(p => p.id === id ? { ...p, ...position } : p) };
  if (kind === 'wall') return { ...layout, walls: layout.walls.map((p, i) => i === Number(id) ? position : p) };
  if (kind === 'gate') return { ...layout, gates: layout.gates.map(p => p.id === id ? { ...p, ...position } : p) };
  if (kind === 'bus') return { ...layout, bus: position };
  return layout;
}
export const campusItemTiles = (item: CampusItem) => item.size === 2 ? buildingTiles(item.gridX, item.gridY) : [[item.gridX, item.gridY]];
export const editorProject = (x: number, y: number) => ({ x: 500 + (x - y) * 46, y: 44 + (x + y) * 25 });
export function editorTile(x: number, y: number) {
  return [[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([gx,gy]) => { const p=editorProject(gx,gy);return `${p.x},${p.y}`; }).join(' ');
}

export function campusPlacementMessage(message: string) {
  return Object.entries(BUILDING_INFO).reduce((text, [type, info]) => text.split(type.replace(/_/g, ' ')).join(info.name), message);
}
