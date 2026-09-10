import React from 'react';

export const TURF = { dark: '#245d37', light: '#2b6a3f', apron: '#1c492d', chalk: '#e0e8d6' };
interface Props {
  project: (x: number, y: number) => { x: number; y: number };
  x1: number; y1: number; x2: number; y2: number;
  lineWidth: number;
  markingsOnly?: boolean;
}
/** One 120-yard field: two 10-yard end zones and a 100-yard playing surface.
 * Home and battle use the same paint, projected into their own existing layout. */
export function FieldPaint({ project, x1, y1, x2, y2, lineWidth, markingsOnly = false }: Props) {
  const p = (x: number, yard: number) => project(x1 + (x2 - x1) * x, y1 + (y2 - y1) * yard / 120);
  const rect = (a: number, b: number) => [p(0, a), p(1, a), p(1, b), p(0, b)].map(v => `${v.x},${v.y}`).join(' ');
  const line = (x: number, yard: number, endX: number, endYard: number, key: string, strong = false) => {
    const a = p(x, yard), b = p(endX, endYard);
    return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={TURF.chalk} strokeOpacity={strong ? 0.7 : 0.38} strokeWidth={lineWidth * (strong ? 1 : 0.55)} />;
  };
  return <g>
    {!markingsOnly && <>
    <polygon points={rect(0, 120)} fill={TURF.dark} />
    {Array.from({ length: 10 }, (_, i) => <polygon key={i} points={rect(10 + i * 10, 20 + i * 10)} fill={i % 2 ? TURF.dark : TURF.light} />)}
    <polygon points={rect(0, 10)} fill="var(--fhq-home-paint, #8c481d)" opacity={0.75} />
    <polygon points={rect(110, 120)} fill="var(--fhq-away-paint, #182923)" opacity={0.8} />
    </>}
    {Array.from({ length: 21 }, (_, i) => line(0, 10 + i * 5, 1, 10 + i * 5, `yard-${i}`, i === 0 || i === 10 || i === 20))}
    {Array.from({ length: 19 }, (_, i) => [0.37, 0.63].map(x => line(x - 0.012, 15 + i * 5, x + 0.012, 15 + i * 5, `hash-${i}-${x}`, true)))}
    {[20, 30, 40, 50, 60, 70, 80, 90, 100].map(yard => [0.1, .9].map(x => {
      const pos = p(x, yard); const across = p(x + .1, yard);
      const angle = Math.atan2(across.y - pos.y, across.x - pos.x) * 180 / Math.PI;
      return <text key={`number-${x}-${yard}`} x={pos.x} y={pos.y} fill={TURF.chalk} opacity={.72} textAnchor="middle" dominantBaseline="middle" fontSize={lineWidth * 8} fontFamily="Arial, sans-serif" fontWeight="700" transform={`rotate(${angle},${pos.x},${pos.y})`}>{Math.min(yard - 10, 110 - yard)}</text>;
    }))}
    <polygon points={rect(0, 120)} fill="none" stroke={TURF.chalk} strokeOpacity={0.6} strokeWidth={lineWidth} />
  </g>;
}
