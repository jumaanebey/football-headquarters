import React, { useEffect, useRef, useState } from 'react';
import { HeroAnimation, heroFrame, keyHeroPixels, advanceHeroStride } from '../game/heroAnimation';

import { HERO_ATLAS } from '../game/heroAtlas';
import { heroPixelOwners } from '../game/heroPixelOwners';
import { advanceSignaturePlayback, asSignatureBeat, heroSignaturePose, previewSignatureBeat, SIGNATURE_BEATS, type SignaturePlayback } from '../game/heroSignaturePresentation';
import { loadHeroSignatures } from './loadHeroSignatures';
import { paintHeroSignatureCue } from './paintHeroSignatureCue';

type Sheet = { frames: HTMLCanvasElement[] };
const sheets = new Map<string, Promise<Sheet>>();
function loadSheet(key: string): Promise<Sheet> {
  if (!sheets.has(key)) sheets.set(key, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const bounds = HERO_ATLAS[key];
        if (!bounds || bounds.length !== 9) throw new Error('Incomplete hero atlas');
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        keyHeroPixels(data.data); ctx.putImageData(data, 0, 0);
        const owners = heroPixelOwners(data.data, canvas.width, canvas.height, bounds);
        // One scale for the whole actor: no size pumping between poses.
        const scale = Math.min(340 / Math.max(...bounds.map(b => b[2] - b[0])), 346 / Math.max(...bounds.map(b => b[3] - b[1])));
        const frames = bounds.map((b, frame) => {
          const out = document.createElement('canvas'); out.width = out.height = 384;
          const target = out.getContext('2d');
          if (!target) throw new Error('Canvas unavailable');
          const [x, y, right, bottom] = b, w = right - x, h = bottom - y;
          const crop = document.createElement('canvas'); crop.width = w; crop.height = h;
          const cropCtx = crop.getContext('2d')!;
          const clean = ctx.getImageData(x, y, w, h);
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const owner = owners[(y + yy) * canvas.width + x + xx];
            if (owner >= 0 && owner !== frame) clean.data[(yy * w + xx) * 4 + 3] = 0;
          }
          cropCtx.putImageData(clean, 0, 0);
          // Anchor around head/torso, rather than the extremity of a swinging arm.
          let sum = 0, count = 0;
          for (let yy = Math.ceil(y + h * .06); yy < y + h * .30; yy++) {
            for (let xx = x; xx < right; xx++) if (owners[yy * canvas.width + xx] === frame && data.data[(yy * canvas.width + xx) * 4 + 3] > 128) { sum += xx; count++; }
          }
          const anchor = count ? sum / count - x : w / 2;
          const left = Math.max(12, Math.min(372 - w * scale, 192 - anchor * scale));
          const lift = frame === 3 || frame === 6 ? 5 : 0;
          target.drawImage(crop, left, 370 - h * scale - lift, w * scale, h * scale);
          return out;
        });
        resolve({ frames });
      } catch (error) { sheets.delete(key); reject(error); }
    };
    image.onerror = () => { sheets.delete(key); reject(new Error(`Hero art unavailable: ${key}`)); };
    image.src = `/assets/heroes/elite/${key}.webp`;
  }));
  return sheets.get(key)!;
}

export function AnimatedHero({ heroKey, mode = 'idle', facing = -1, cycle = 0.48, label = '', className = '', elapsedSeconds, elapsedRef, filter, signatureFrame, playbackKey = 0, driving = false, loadSignatureArt = false, playbackRate = 1 }: {
  heroKey: string; mode?: HeroAnimation; facing?: number; cycle?: number; label?: string; className?: string; elapsedSeconds?: number; elapsedRef?: React.RefObject<number>; filter?: string; signatureFrame?: number; playbackKey?: number; driving?: boolean; loadSignatureArt?: boolean; playbackRate?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playback = useRef({ mode, cycle, elapsedSeconds, elapsedRef, signatureFrame, playbackKey, driving, playbackRate });
  playback.current = { mode, cycle, elapsedSeconds, elapsedRef, signatureFrame, playbackKey, driving, playbackRate };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false, raf = 0;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let signatures: HTMLCanvasElement[] = [];
    if (loadSignatureArt) loadHeroSignatures(heroKey).then(frames => { if (!disposed) signatures = frames; }).catch(() => { /* Approved base poses remain available. */ });
    setReady(false);
    loadSheet(heroKey).then(sheet => {
      if (disposed) return;
      const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      let previous = performance.now(), elapsed = 0, stride = 0, previousMode = playback.current.mode, previousTake = playback.current.playbackKey;
      let lastDraw = '', announced = false;
      let signaturePlayback: SignaturePlayback = { seconds: 0, authored: false };
      const draw = (now: number) => {
        if (disposed) return;
        if (previousMode !== playback.current.mode || previousTake !== playback.current.playbackKey) {
          elapsed = 0; stride = 0; signaturePlayback = { seconds: 0, authored: false };
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
        const beat = asSignatureBeat(playback.current.signatureFrame) ?? (playback.current.mode === 'signature' ? previewSignatureBeat(heroKey, frameElapsed) : undefined);
        signaturePlayback = advanceSignaturePlayback(signaturePlayback, beat, delta, signatures.length === 4);
        const pose = beat === undefined ? undefined : heroSignaturePose(heroKey, beat, signaturePlayback.seconds, media.matches);
        const baseFrame = pose?.frame ?? heroFrame(playback.current.mode, frameElapsed, walking ? 1 : playback.current.cycle, media.matches);
        const signatureCanvas = !media.matches && signaturePlayback.authored && beat !== undefined ? signatures[beat] : undefined;
        const frame = signatureCanvas ? 100 + beat! : baseFrame;
        const drive = walking && playback.current.driving && !media.matches;
        const scaleY = pose?.scaleY ?? (drive ? .96 : 1);
        const lean = pose?.lean ?? (drive ? .035 : 0);
        const drawKey = `${frame}:${beat}:${scaleY.toFixed(3)}:${lean.toFixed(3)}:${pose?.cueOpacity.toFixed(2)}`;
        if (!document.hidden && drawKey !== lastDraw) {
          ctx.clearRect(0, 0, 384, 384);
          ctx.save();
          // Keep the same ground registration through the planted action.
          ctx.translate(192, 370);
          ctx.transform(1, 0, lean, scaleY, 0, 0);
          ctx.translate(-192, -370);
          ctx.drawImage(signatureCanvas ?? sheet.frames[baseFrame], 0, 0);
          ctx.restore();
          if (pose) paintHeroSignatureCue(ctx, pose);
          canvas.dataset.frame = String(frame);
          canvas.dataset.signatureBeat = beat === undefined ? 'none' : SIGNATURE_BEATS[beat].toLowerCase();
          canvas.dataset.driving = drive ? '1' : '0';
          lastDraw = drawKey; if (!announced) { setReady(true); announced = true; }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }).catch(() => { if (!disposed) setReady(false); });
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [heroKey, loadSignatureArt]);
  return <canvas ref={canvasRef} width={384} height={384} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}
    data-ready={ready ? '1' : '0'} className={`fhq-modern-hero absolute inset-0 w-full h-full object-contain pointer-events-none ${className}`}
    style={{ filter, opacity: ready ? 1 : 0, transformOrigin: '50% 96%', animation: mode === 'idle' ? 'fhq-modern-breathe 2.8s ease-in-out infinite' : mode === 'celebrate' ? 'fhq-hero-victory 1.2s ease-in-out infinite' : undefined, transform: facing > 0 ? 'scaleX(-1)' : undefined }} />;
}
