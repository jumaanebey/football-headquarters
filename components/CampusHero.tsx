import React, { useEffect, useState } from 'react';
import { AnimatedHero } from './AnimatedHero';
import { HERO_DEFS } from '../battle';

export function CampusHero({ heroKey, lane, field, project, onSelect }: {
  heroKey: string; lane: number; field: { x1: number; x2: number; y1: number; y2: number };
  project: (x: number, y: number) => { x: number; y: number }; onSelect?: () => void;
}) {
  const [time, setTime] = useState(lane * 2);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now();
    const timer = window.setInterval(() => {
      if (!document.hidden) setTime(media.matches ? lane * 2 : (performance.now() - start) / 1000 + lane * 2);
    }, 100);
    return () => window.clearInterval(timer);
  }, [lane]);
  const phase = time % 14, outward = phase < 7;
  const progress = outward ? Math.min(1, phase / 5.5) : 1 - Math.min(1, (phase - 7) / 5.5);
  const walking = phase % 7 < 5.5;
  const x = field.x1 + (field.x2 - field.x1) * (0.22 + lane * 0.25);
  const y = field.y1 + (field.y2 - field.y1) * (0.15 + progress * 0.7);
  const point = project(x, y), def = HERO_DEFS.find(h => h.key === heroKey)!;
  return <button type="button" aria-label={`Open ${def.name}`} title={def.name} onClick={e => { e.stopPropagation(); onSelect?.(); }}
    className="absolute rounded-full focus-visible:outline focus-visible:outline-orange-400"
    style={{ left: point.x, top: point.y, width: 50, height: 50, transform: 'translate(-50%,-96%)', zIndex: Math.round(x + y) + 6, transition: 'left 100ms linear, top 100ms linear', pointerEvents: 'auto' }}>
    <span className="absolute rounded-[50%] bg-black/30" style={{ left: '25%', bottom: '-2%', width: '50%', height: '10%' }} />
    <img src={def.art} alt="" className="fhq-campus-hero-fallback absolute inset-0 w-full h-full object-contain" />
    <AnimatedHero heroKey={heroKey} mode={walking ? 'walk' : 'idle'} cycle={0.65} facing={outward ? -1 : 1} />
  </button>;
}
