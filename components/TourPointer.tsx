import React, { useEffect, useState } from 'react';
import { GameState } from '../types';
import { getObjective } from '../objectives';

interface Props {
  gameState: GameState;
  // Suppress the pointer while any modal is open (it would point at hidden things).
  active: boolean;
}

interface Anchor { cx: number; top: number; bottom: number; width: number; height: number; }

/**
 * A bouncing arrow that points at whatever DOM element carries the
 * `data-tour="<target>"` matching the current objective. Tracks moving collect
 * bubbles at 10 Hz; stationary targets do not cause another React render.
 */
export const TourPointer: React.FC<Props> = ({ gameState, active }) => {
  const target = active ? getObjective(gameState).target : null;
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    if (!target) { setAnchor(null); return; }
    let raf = 0;
    let measuredAt = -Infinity;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - measuredAt < 100) return;
      measuredAt = now;
      const el = Array.from(document.querySelectorAll(`[data-tour="${target}"]`)).find(candidate => candidate.getClientRects().length > 0);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) { setAnchor(null); return; }
        const next = { cx: r.left + r.width / 2, top: r.top, bottom: r.bottom, width: window.innerWidth, height: window.innerHeight };
        setAnchor(previous => previous && Object.keys(next).every(key => Math.abs(previous[key as keyof Anchor] - next[key as keyof Anchor]) < .5) ? previous : next);
      } else {
        setAnchor(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!target || !anchor) return null;

  // Point up from below if the target sits near the top of the screen (HUD area),
  // otherwise hover just above it and point down.
  const pointUp = anchor.top < 130;
  const size = 44;
  const gap = 10;
  const y = Math.max(4, Math.min(anchor.height - size - 4, pointUp ? anchor.bottom + gap : anchor.top - gap - size));

  return (
    <div
      className="fixed z-[65] pointer-events-none"
      aria-hidden="true"
      style={{ left: Math.max(4, Math.min(anchor.width - size - 4, anchor.cx - size / 2)), top: y, width: size, height: size, transform: pointUp ? 'rotate(180deg)' : undefined }}
    >
      <div className="w-full h-full animate-bounce drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
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
