import { subscribeHeroAnimation } from './heroAnimationClock';
import { heroMotionColumns } from '../game/heroMotion';
import { heroPresentation } from '../game/heroPresentation';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HeroAnimation, heroFrame, advanceHeroStride } from '../game/heroAnimation';
import { advanceSignaturePlayback, battleSignatureBeat, heroSignaturePose, previewSignatureBeat, SIGNATURE_BEATS, type SignaturePlayback } from '../game/heroSignaturePresentation';
import { paintHeroSignatureCue } from './paintHeroSignatureCue';
import { hasReactionSheet, loadHeroArtWhileMounted, loadHeroArtWithRetry, retainHeroArt, type HeroArtKind } from './heroArtLoader';
import { campusFrameMap } from '../game/heroCampusSheet';

/** Which art a mount may request. `campus` (default): only the derived campus sheet — idle,
 *  stride and the nine poses at card quality, ~200 KB per hero, held until the campus art gate
 *  opens. `battle`: the authored elite atlas, directional motion, hit reactions and (when asked)
 *  signature poses, each an independent request that starts at mount and never waits on the
 *  others. Battle mounts are the only ones that may cost multi-megabyte sheets. */
export type HeroArtTier = 'campus' | 'battle';
type Sheet = { frames: HTMLCanvasElement[]; campus?: HTMLCanvasElement[] };

export function AnimatedHero({ tier = 'campus', heroKey, mode = 'idle', facing = -1, cycle = 0.48, label = '', className = '', elapsedSeconds, elapsedRef, filter, signatureFrame, playbackKey = 0, contactSeconds, driving = false, loadSignatureArt = false, playbackRate = 1, onSignatureComplete, motionFrame, offset }: {
  tier?: HeroArtTier; motionFrame?: number; /** Cosmetic screen offset in 384-space units (hit reactions); never changes registration. */ offset?: { dx: number; dy: number }; heroKey: string; mode?: HeroAnimation; facing?: number; cycle?: number; label?: string; className?: string; elapsedSeconds?: number; elapsedRef?: React.RefObject<number>; filter?: string; signatureFrame?: number; playbackKey?: number; contactSeconds?: number; driving?: boolean; loadSignatureArt?: boolean; playbackRate?: number; onSignatureComplete?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderNowRef = useRef<(() => void) | null>(null);
  const playback = useRef({ motionFrame, facing, mode, cycle, elapsedSeconds, elapsedRef, signatureFrame, playbackKey, contactSeconds, driving, playbackRate, onSignatureComplete, offset });
  playback.current = { motionFrame, facing, mode, cycle, elapsedSeconds, elapsedRef, signatureFrame, playbackKey, contactSeconds, driving, playbackRate, onSignatureComplete, offset };
  const profile = heroPresentation(heroKey);
  const [ready, setReady] = useState(false);
  // Event-clock poses and distance-driven footfalls must be painted alongside
  // the new actor position, even if the browser throttles cosmetic RAF work.
  useLayoutEffect(() => { renderNowRef.current?.(); }, [motionFrame, facing, mode, signatureFrame, elapsedSeconds, playbackKey, contactSeconds, driving, offset?.dx, offset?.dy]);
  useEffect(() => {
    let disposed = false, visible = true;
    let unsubscribe = () => {};
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; });
    if (canvasRef.current) observer.observe(canvasRef.current);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const signal = { disposed: false };
    // Hold the frames this mount draws so a post-battle release never pulls them from under a live consumer.
    const retainedKinds: HeroArtKind[] = tier === 'battle' ? ['elite', 'motion', ...(hasReactionSheet(heroKey) ? ['reaction' as const] : []), ...(loadSignatureArt ? ['signature' as const] : [])] : ['campus'];
    const releases: Array<() => void> = [];
    const retainAll = () => { for (const kind of retainedKinds) releases.push(retainHeroArt(kind, heroKey)); };
    let signatures: HTMLCanvasElement[] = [];
    let motion: HTMLCanvasElement[] = [];
    let reactions: HTMLCanvasElement[] = [];
    const motionFrameCount = HERO_MOTION_BOUNDS[heroKey]?.length ?? 0;
    const campusMap = campusFrameMap(heroKey);
    if (tier === 'battle') {
      // Independent requests: a slow signature sheet never delays stride frames, and vice versa.
      // Elite poses keep animating while any of these is missing; each is re-requested on reconnect while mounted.
      loadHeroArtWhileMounted('motion', heroKey, signal, frames => { motion = frames; });
      if (hasReactionSheet(heroKey)) loadHeroArtWhileMounted('reaction', heroKey, signal, frames => { reactions = frames; });
      if (loadSignatureArt) loadHeroArtWhileMounted('signature', heroKey, signal, frames => { signatures = frames; });
    }
    setReady(false);
    const base: Promise<Sheet> = tier === 'battle'
      ? loadHeroArtWithRetry('elite', heroKey, signal).then(frames => ({ frames }))
      : loadHeroArtWithRetry('campus', heroKey, signal).then(frames => ({ frames: campusMap.elite.map(i => frames[i]), campus: frames }));
    base.then(sheet => {
      if (disposed) return;
      retainAll();
      const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      let previous = performance.now(), elapsed = 0, stride = 0, previousMode = playback.current.mode, previousTake = playback.current.playbackKey;
      let lastDraw = '', announced = false, signatureCompleted = false;
      let signaturePlayback: SignaturePlayback = { seconds: 0, authored: false };
      const draw = (now: number) => {
        if (disposed) return;
        if (!visible) { previous = now; return; }
        if (previousMode !== playback.current.mode || previousTake !== playback.current.playbackKey) {
          elapsed = 0; stride = 0; signaturePlayback = { seconds: 0, authored: false };
          signatureCompleted = false;
          previousMode = playback.current.mode; previousTake = playback.current.playbackKey;
        }
        const rate = Number.isFinite(playback.current.playbackRate) ? Math.max(.25, Math.min(1, playback.current.playbackRate)) : 1;
        const delta = document.hidden ? 0 : Math.min((now - previous) / 1000, 0.05) * rate;
        if (!document.hidden) {
          elapsed += delta;
          if (playback.current.mode === 'walk') stride = advanceHeroStride(stride, delta, playback.current.cycle);
        }
        previous = now;
        const walking = playback.current.mode === 'walk';
        const frameElapsed = playback.current.elapsedRef?.current ?? playback.current.elapsedSeconds ?? (walking ? stride : elapsed);
        const beat = battleSignatureBeat(heroKey, playback.current.mode, playback.current.signatureFrame, playback.current.contactSeconds) ?? (playback.current.mode === 'signature' ? previewSignatureBeat(heroKey, frameElapsed) : undefined);
        // Film Room completion shares this clock. A wall-clock timeout can cut
        // off the release on a slow device or after pausing a hidden tab.
        if (!document.hidden && playback.current.mode === 'signature' && beat === undefined && frameElapsed > 0 && !signatureCompleted) {
          signatureCompleted = true;
          playback.current.onSignatureComplete?.();
        }
        signaturePlayback = advanceSignaturePlayback(signaturePlayback, beat, delta, signatures.length === 4);
        const pose = beat === undefined ? undefined : heroSignaturePose(heroKey, beat, signaturePlayback.seconds, media.matches, signaturePlayback.authored);
        const baseFrame = pose?.frame ?? heroFrame(playback.current.mode, frameElapsed, walking ? 1 : playback.current.cycle, media.matches);
        // The Set beat shows the profile's preparation plant (a motion frame) when the sprite supplies one; authored signature frames take over from Load.
        const prepFrame = beat === 0 && playback.current.motionFrame !== undefined;
        const signatureCanvas = !media.matches && signaturePlayback.authored && beat !== undefined && !prepFrame ? signatures[beat] : undefined;
        const previewMotion = playback.current.mode === 'walk' ? (playback.current.facing > 0 ? heroMotionColumns(heroKey) : 0) + 2 + Math.floor((((frameElapsed % 1) + 1) % 1) * 4) : playback.current.mode === 'idle' ? (playback.current.facing > 0 ? heroMotionColumns(heroKey) : 0) : undefined;
        const selectedMotion = playback.current.motionFrame ?? previewMotion;
        // A motion frame may also stand in during the signature's Set beat (the profile's preparation plant).
        const motionAllowed = beat === undefined || prepFrame;
        const motionCanvas = !media.matches && !signatureCanvas && motionAllowed && selectedMotion !== undefined
          ? (tier === 'battle' ? (selectedMotion < motionFrameCount ? motion[selectedMotion] : reactions[selectedMotion - motionFrameCount]) : (campusMap.motion[selectedMotion] !== undefined ? sheet.campus?.[campusMap.motion[selectedMotion]] : undefined))
          : undefined;
        const idleCanvas = !motionCanvas && beat === undefined && playback.current.mode === 'idle' && !['qb','enforcer'].includes(heroKey) ? signatures[0] : undefined;
        const frame = idleCanvas ? 100 : signatureCanvas ? 100 + beat! : motionCanvas ? 200 + selectedMotion! : baseFrame;
        const drive = walking && playback.current.driving && !media.matches;
        const scaleY = pose?.scaleY ?? (drive ? .96 : 1);
        const lean = pose?.lean ?? (drive ? .035 : 0);
        const kick = media.matches ? undefined : playback.current.offset;
        const drawKey = `${playback.current.facing}:${frame}:${beat}:${scaleY.toFixed(3)}:${lean.toFixed(3)}:${pose?.cueOpacity.toFixed(2)}:${kick?.dx.toFixed(1) ?? 0}:${kick?.dy.toFixed(1) ?? 0}`;
        if (!document.hidden && drawKey !== lastDraw) {
          ctx.clearRect(0, 0, 384, 384);
          ctx.save();
          if (kick) ctx.translate(kick.dx, kick.dy);
          if (!motionCanvas && playback.current.facing > 0) { ctx.translate(384, 0); ctx.scale(-1, 1); }
          // Keep the same ground registration through the planted action.
          ctx.translate(192, 370);
          ctx.transform(1, 0, lean, scaleY, 0, 0);
          ctx.translate(-192, -370);
          ctx.drawImage(signatureCanvas ?? motionCanvas ?? idleCanvas ?? sheet.frames[baseFrame], 0, 0, 384, 384);
          if (pose) paintHeroSignatureCue(ctx, pose);
          ctx.restore();
          canvas.dataset.frame = String(frame);
          canvas.dataset.kick = kick ? `${kick.dx.toFixed(1)},${kick.dy.toFixed(1)}` : '0,0';
          canvas.dataset.signatureBeat = beat === undefined ? 'none' : SIGNATURE_BEATS[beat].toLowerCase();
          canvas.dataset.driving = drive ? '1' : '0';
          lastDraw = drawKey; if (!announced) { setReady(true); announced = true; }
        }

      };
      renderNowRef.current = () => draw(performance.now());
      renderNowRef.current();
      unsubscribe = subscribeHeroAnimation(draw);
    }).catch(() => { if (!disposed) setReady(false); });
    return () => { disposed = true; signal.disposed = true; for (const release of releases) release(); unsubscribe(); observer.disconnect(); renderNowRef.current = null; };
  }, [heroKey, loadSignatureArt, tier]);
  return <canvas ref={canvasRef} width={384} height={384} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}
    data-ready={ready ? '1' : '0'} className={`fhq-modern-hero absolute inset-0 w-full h-full object-contain pointer-events-none ${className}`}
    style={{ filter, opacity: ready ? 1 : 0, transformOrigin: '50% 96%', ['--fhq-breath' as string]: profile.idle.breathAmplitude, animation: mode === 'idle' ? `fhq-modern-breathe ${profile.idle.breathSeconds}s ease-in-out infinite` : mode === 'celebrate' ? 'fhq-hero-victory 1.2s ease-in-out infinite' : undefined }} />;
}
