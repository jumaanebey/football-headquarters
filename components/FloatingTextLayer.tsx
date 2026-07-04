import React from 'react';
import { FloatingText } from '../types';

interface Props {
  items: FloatingText[];
}

// Renders transient reward/status text that floats up and fades (see the `collect`
// keyframe in index.html). App removes each item from state after ~1s.
export const FloatingTextLayer: React.FC<Props> = ({ items }) => (
  <div className="fixed inset-0 pointer-events-none z-50">
    {items.map(ft => (
      <div
        key={ft.id}
        className="absolute font-display font-black text-xl animate-collect whitespace-nowrap"
        style={{
          left: ft.x,
          top: ft.y,
          color: ft.color,
          transform: 'translate(-50%, -50%)',
          textShadow: '0 2px 4px rgba(0,0,0,0.7)',
        }}
      >
        {ft.text}
      </div>
    ))}
  </div>
);
