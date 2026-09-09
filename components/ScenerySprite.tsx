import React from 'react';
import { GROUND_ART } from '../game/groundArt';
import { MatteSprite } from './MatteSprite';
import { FieldPaint } from './FieldPaint';

export interface ScenerySpriteProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Resolve floorless art in every scene while leaving save-file asset URLs intact. */
export function ScenerySprite({ src, alt = '', className, style }: ScenerySpriteProps) {
  const art = GROUND_ART[src];
  if (art) return <MatteSprite src={art.src} region={art.region} fallback={src} alt={alt} className={className} style={style}
    underlay={art.field && <svg viewBox="0 0 512 512" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <FieldPaint markingsOnly lineWidth={1.2} x1={0} y1={0} x2={1} y2={1}
        project={(x, y) => {
          const [ox, oy, ux, uy, vx, vy] = art.field!;
          return { x: ox + x * ux + y * vx, y: oy + x * uy + y * vy };
        }} />
    </svg>} />;
  return <img src={src} alt={alt} draggable={false} className={className} style={style}
    onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />;
}
