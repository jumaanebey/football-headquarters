// Dev-only motion comparison fixture (served by `vite` only; not part of the production build).
// All nine heroes run the same scripted path — idle → start → move left → turn → move right →
// stop → attack → hit → signature → idle — through the real BattleHeroSprite/AnimatedHero with a
// synthetic actor whose fields are what the simulation would supply. The clock is controllable
// (pause, step, speed) and exposed as window.__fhqMotionFixture for scripts/motion-clips.mjs.
// `?profiles=off` empties the presentation table so every hero falls back to the base profile
// ("before"). `?scale=phone|large|both`. Nothing here is a game-state API.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BattleHeroSprite } from '../components/BattleHeroSprite';
import { MODERN_HEROES } from '../game/heroAnimation';
import { HERO_MOVEMENT_STYLE } from '../game/heroMovementStyle';
import { openCampusArt } from '../game/artGate';
import { HERO_DEFS } from '../battle';
import { spriteMotion } from '../game/spriteMotion';

const params = new URLSearchParams(location.search);
// `?profiles=off` flattens every hero onto the Franchise's values, which is what a single shared
// table looked like before per-hero identity existed. Dev fixture only; the module is not shipped modified.
if (params.get('profiles') === 'off') for (const key of Object.keys(HERO_MOVEMENT_STYLE)) HERO_MOVEMENT_STYLE[key] = { ...HERO_MOVEMENT_STYLE.qb, identity: 'flattened baseline' };
openCampusArt();

/** Scripted path in simulation seconds: [until, kind] segments. */
const SCRIPT: Array<[number, 'idle' | 'left' | 'right' | 'attack' | 'hit' | 'signature']> = [[.6, 'idle'], [2.2, 'left'], [3.8, 'right'], [4.6, 'idle'], [5.2, 'attack'], [5.6, 'idle'], [5.9, 'hit'], [6.6, 'idle'], [8.4, 'signature'], [9.4, 'idle']];
const TOTAL = SCRIPT[SCRIPT.length - 1][0];
const segmentAt = (t: number) => { let start = 0; for (const [until, kind] of SCRIPT) { if (t < until) return { kind, start, until }; start = until; } return { kind: 'idle' as const, start: TOTAL, until: TOTAL + 1 }; };
type Actor = { x: number; y: number; face: number; moving: boolean; stridePhase: number; strideSeconds: number; actionPoseT: number; abilityPoseT: number; signatureFrame: number | undefined; truckT: number; hitFlash: number };

function advance(a: Actor, t: number, dt: number): Actor {
  const seg = segmentAt(t);
  const next: Actor = { ...a };
  const speed = 12; // field units per second, like a typical hero
  let nx = a.x;
  if (seg.kind === 'left') nx = a.x - speed * dt; else if (seg.kind === 'right') nx = a.x + speed * dt;
  const m = spriteMotion({ x: a.x, y: a.y }, { x: nx, y: a.y }, dt, a.face, a.stridePhase);
  next.x = nx; next.moving = m.moving; next.stridePhase = m.stridePhase; next.strideSeconds = m.strideSeconds; if (m.moving) next.face = m.face;
  next.actionPoseT = seg.kind === 'attack' ? Math.max(0, .28 - (t - seg.start)) : 0;
  next.hitFlash = seg.kind === 'hit' ? Math.max(0, .18 - (t - seg.start)) : 0;
  next.signatureFrame = seg.kind === 'signature' ? Math.min(3, Math.floor((t - seg.start) / .45)) : undefined;
  return next;
}
const initial = (): Actor => ({ x: 50, y: 50, face: -1, moving: false, stridePhase: 0, strideSeconds: .42, actionPoseT: 0, abilityPoseT: 0, signatureFrame: undefined, truckT: 0, hitFlash: 0 });

function Fixture() {
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(params.get('paused') === '1');
  const [speed, setSpeed] = useState(Number(params.get('speed') ?? 1));
  const actors = useRef<Record<string, Actor>>(Object.fromEntries(MODERN_HEROES.map(k => [k, initial()])));
  const [, tick] = useState(0);
  const step = (dt: number) => { const nt = Math.min(TOTAL + .5, t + dt); for (const k of MODERN_HEROES) actors.current[k] = advance(actors.current[k], nt, dt); setT(nt); tick(x => x + 1); };
  const stepRef = useRef(step); stepRef.current = step;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => { const dt = Math.min(.05, (now - last) / 1000) * speed; last = now; if (!paused) stepRef.current(dt); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [paused, speed]);
  useEffect(() => {
    const api = {
      step: (dt = .05) => stepRef.current(dt), pause: () => setPaused(true), play: () => setPaused(false), setSpeed: (s: number) => setSpeed(s),
      reset: () => { for (const k of MODERN_HEROES) actors.current[k] = initial(); setT(0); tick(x => x + 1); },
      time: () => t, total: TOTAL, script: SCRIPT, profiles: params.get('profiles') !== 'off',
      snapshot: () => Object.fromEntries(MODERN_HEROES.map(k => { const c = document.querySelector<HTMLCanvasElement>(`[data-hero="${k}"] .large canvas.fhq-modern-hero`); return [k, { frame: c?.dataset.frame ?? null, ready: c?.dataset.ready ?? null, beat: c?.dataset.signatureBeat ?? null, kick: c?.dataset.kick ?? null, segment: segmentAt(t).kind, x: Number(actors.current[k].x.toFixed(2)), face: actors.current[k].face }]; })),
    };
    (window as unknown as { __fhqMotionFixture: typeof api }).__fhqMotionFixture = api;
  }, [t]);
  const scale = params.get('scale') ?? 'both';
  const seg = segmentAt(t);
  return <>
    <div className="controls">
      <button onClick={() => setPaused(p => !p)}>{paused ? 'Play' : 'Pause'}</button>
      <button onClick={() => step(.05)}>Step 50 ms</button>
      <label>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.25, .5, 1, 2].map(s => <option key={s} value={s}>{s}×</option>)}</select></label>
      <span className="meta">t = {t.toFixed(2)} s · {seg.kind} · profiles {params.get('profiles') === 'off' ? 'OFF (base)' : 'ON'}</span>
      <a href="?profiles=off" style={{ color: '#fbbf24' }}>before</a><a href="?" style={{ color: '#fbbf24' }}>after</a>
    </div>
    {MODERN_HEROES.map(key => { const a = actors.current[key]; const def = HERO_DEFS.find(h => h.key === key)!; return <div className="row" data-hero={key} key={key}>
      <span className="name">{def.name}<br /><small>{key}</small></span>
      {(scale === 'both' || scale === 'phone') && <span className="cell phone"><img src={def.art} alt="" /><BattleHeroSprite heroKey={key} actor={a} fighting simulationTime={t} /></span>}
      {(scale === 'both' || scale === 'large') && <span className="cell large"><img src={def.art} alt="" /><BattleHeroSprite heroKey={key} actor={a} fighting simulationTime={t} /></span>}
      <span className="meta">x {a.x.toFixed(1)} face {a.face} {a.moving ? 'moving' : 'still'} phase {a.stridePhase.toFixed(2)}{a.actionPoseT ? ` attack ${a.actionPoseT.toFixed(2)}` : ''}{a.hitFlash ? ` hit ${a.hitFlash.toFixed(2)}` : ''}{a.signatureFrame !== undefined ? ` sig beat ${a.signatureFrame}` : ''}</span>
    </div>; })}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
