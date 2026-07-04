import React, { useEffect, useState } from 'react';
import { GameState } from '../types';
import { getObjective } from '../objectives';

interface Props {
  gameState: GameState;
  // Suppress the pointer while any modal is open (it would point at hidden things).
  active: boolean;
}

interface Anchor { cx: number; top: number; bottom: number; }

/**
 * A bouncing arrow that points at whatever DOM element carries the
 * `data-tour="<target>"` matching the current objective. Re-measures every frame
 * so it tracks the board's responsive scaling and the moving collect bubble.
 */
export const TourPointer: React.FC<Props> = ({ gameState, active }) => {
  const target = active ? getObjective(gameState).target : null;
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    if (!target) { setAnchor(null); return; }
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
      } else {
        setAnchor(null);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!target || !anchor) return null;

  // Point up from below if the target sits near the top of the screen (HUD area),
  // otherwise hover just above it and point down.
  const pointUp = anchor.top < 130;
  const size = 44;
  const gap = 10;
  const y = pointUp ? anchor.bottom + gap : anchor.top - gap - size;

  return (
    <div
      className="fixed z-[65] pointer-events-none"
      style={{ left: anchor.cx - size / 2, top: y, width: size, height: size }}
    >
      <div className="w-full h-full animate-bounce drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" style={{ transform: pointUp ? 'rotate(180deg)' : 'none' }}>
        {/* Chunky downward arrow */}
        <svg viewBox="0 0 44 44" width={size} height={size}>
          <g>
            <rect x="16" y="4" width="12" height="20" rx="3" fill="#facc15" stroke="#78350f" strokeWidth="1.5" />
            <path d="M8 22 L22 40 L36 22 Z" fill="#facc15" stroke="#78350f" strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        </svg>
      </div>
    </div>
  );
};
