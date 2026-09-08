import React from 'react';

export const TURF = { dark: '#19472d', light: '#1d5033', apron: '#123522', chalk: '#e0e8d6' };
interface Props {
  project: (x: number, y: number) => { x: number; y: number };
  x1: number; y1: number; x2: number; y2: number;
  lineWidth: number;
}
/** One 120-yard field: two 10-yard end zones and a 100-yard playing surface.
 * Home and battle use the same paint, projected into their own existing layout. */
export function FieldPaint({ project, x1, y1, x2, y2, lineWidth }: Props) {
  const p = (x: number, yard: number) => project(x1 + (x2 - x1) * x, y1 + (y2 - y1) * yard / 120);
  const rect = (a: number, b: number) => [p(0, a), p(1, a), p(1, b), p(0, b)].map(v => `${v.x},${v.y}`).join(' ');
  const line = (x: number, yard: number, endX: number, endYard: number, key: string, strong = false) => {
    const a = p(x, yard), b = p(endX, endYard);
    return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={TURF.chalk} strokeOpacity={strong ? 0.7 : 0.38} strokeWidth={lineWidth * (strong ? 1 : 0.55)} />;
  };
  return <g>
    <polygon points={rect(0, 120)} fill={TURF.dark} />
    {Array.from({ length: 10 }, (_, i) => <polygon key={i} points={rect(10 + i * 10, 20 + i * 10)} fill={i % 2 ? TURF.dark : TURF.light} />)}
    <polygon points={rect(0, 10)} fill="#8c481d" opacity={0.48} />
    <polygon points={rect(110, 120)} fill="#182923" opacity={0.7} />
    {Array.from({ length: 21 }, (_, i) => line(0, 10 + i * 5, 1, 10 + i * 5, `yard-${i}`, i === 0 || i === 10 || i === 20))}
    {Array.from({ length: 19 }, (_, i) => [0.37, 0.63].map(x => line(x - 0.012, 15 + i * 5, x + 0.012, 15 + i * 5, `hash-${i}-${x}`, true)))}
    <polygon points={rect(0, 120)} fill="none" stroke={TURF.chalk} strokeOpacity={0.6} strokeWidth={lineWidth} />
  </g>;
}
