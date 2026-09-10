import React, { useEffect, useRef, useState } from 'react';
import { AnimatedHero } from './AnimatedHero';
import { SpriteFrames, WALK_FRAMES } from './SpriteFrames';
import { HERO_DEFS } from '../battle';
import { hasModernHero } from '../game/heroAnimation';
import { heroPatrol } from '../game/heroPatrol';
import { campusArtOpen, campusArtReady } from '../game/artGate';

export function CampusHero({ heroKey, lane, field, project, onSelect }: {
  heroKey: string; lane: number; field: { x1: number; x2: number; y1: number; y2: number };
  project: (x: number, y: number) => { x: number; y: number }; onSelect?: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [pose, setPose] = useState(() => heroPatrol(lane * 2, lane));
  const [artOpen, setArtOpen] = useState(campusArtOpen());
  useEffect(() => { if (!artOpen) { let live = true; campusArtReady().then(() => { if (live) setArtOpen(true); }); return () => { live = false; }; } }, [artOpen]);
  const animationTime = useRef(pose.mode === 'walk' ? pose.stridePhase : pose.actionElapsed);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, elapsed = lane * 2, previous = performance.now();
    let previousPose = '';
    const draw = (now: number) => {
      // Resume where the athlete stopped when returning from a hidden tab.
      if (!document.hidden) {
        elapsed += Math.min((now - previous) / 1000, 0.05);
        const next = heroPatrol(elapsed, lane, media.matches);
        animationTime.current = next.mode === 'walk' ? next.stridePhase : next.actionElapsed;
        const x = field.x1 + (field.x2 - field.x1) * (0.08 + lane * 0.105);
        const y = field.y1 + (field.y2 - field.y1) * (0.15 + next.progress * 0.7);
        const point = project(x, y);
        if (button.current) {
          button.current.style.left = `${point.x}px`;
          button.current.style.top = `${point.y}px`;
          button.current.style.zIndex = `${Math.round(x + y) + 6}`;
        }
        const signature = `${next.mode}/${next.facing}`;
        if (signature !== previousPose) { previousPose = signature; setPose(next); }
      }
      previous = now;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [lane, field.x1, field.x2, field.y1, field.y2, project]);
  const initial = project(field.x1 + (field.x2 - field.x1) * (0.08 + lane * 0.105), field.y1 + (field.y2 - field.y1) * (0.15 + pose.progress * 0.7));
  const def = HERO_DEFS.find(h => h.key === heroKey)!;
  const modern = hasModernHero(heroKey);
  const action = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body-followthrough.webp' : `/assets/heroes/rig/${heroKey}-action.webp`;
  return <button ref={button} type="button" aria-label={`Open ${def.name}`} title={def.name} onClick={e => { e.stopPropagation(); onSelect?.(); }}
    className="absolute rounded-full focus-visible:outline focus-visible:outline-orange-400"
    style={{ left: initial.x, top: initial.y, width: 48, height: 48, transform: 'translate(-50%,-96%)', pointerEvents: 'auto' }}>
    <span className="absolute rounded-[50%] bg-black/30" style={{ left: '25%', bottom: '-2%', width: '50%', height: '10%' }} />
    {modern && artOpen && <img src={def.art} alt="" className="fhq-campus-hero-fallback absolute inset-0 w-full h-full object-contain" />}
    {modern ? <AnimatedHero heroKey={heroKey} mode={pose.mode} cycle={pose.cycle} facing={pose.facing} elapsedRef={animationTime} /> :
      <span className="fhq-unit absolute inset-0">
        <img src={def.art} alt="" className="fhq-flat absolute inset-0 w-full h-full object-contain" />
        <SpriteFrames sources={pose.mode === 'walk' ? WALK_FRAMES.map(frame => `/assets/heroes/rig/${heroKey}-${frame}.webp`) : [pose.mode === 'attack' ? action : `/assets/heroes/rig/${heroKey}-body.webp`]} duration={pose.cycle} style={{ transform: pose.facing > 0 ? 'scaleX(-1)' : undefined }} />
      </span>}
  </button>;
}
