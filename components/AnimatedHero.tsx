import React, { useEffect, useRef, useState } from 'react';
import { HeroAnimation, heroFrame, keyHeroPixels } from '../game/heroAnimation';

type Sheet = { canvas: HTMLCanvasElement; cellWidth: number; cellHeight: number; bottoms: number[] };
const sheets = new Map<string, Promise<Sheet>>();
function loadSheet(key: string): Promise<Sheet> {
  if (!sheets.has(key)) sheets.set(key, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        keyHeroPixels(data.data); ctx.putImageData(data, 0, 0);
        const cellWidth = canvas.width / 3, cellHeight = canvas.height / 2;
        const bottoms = Array.from({ length: 6 }, (_, frame) => {
          let bottom = 0;
          const x0 = Math.floor((frame % 3) * cellWidth), y0 = Math.floor(Math.floor(frame / 3) * cellHeight);
          for (let y = 0; y < Math.floor(cellHeight); y++) for (let x = 0; x < Math.floor(cellWidth); x++) {
            if (data.data[((y0 + y) * canvas.width + x0 + x) * 4 + 3] > 128) bottom = y;
          }
          return bottom;
        });
        resolve({ canvas, cellWidth, cellHeight, bottoms });
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error(`Hero art unavailable: ${key}`));
    image.src = `/assets/gpt/heroes/${key}-motion.png`;
  }));
  return sheets.get(key)!;
}

export function AnimatedHero({ heroKey, mode = 'idle', facing = -1, cycle = 0.48, label = '', className = '' }: {
  heroKey: string; mode?: HeroAnimation; facing?: number; cycle?: number; label?: string; className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playback = useRef({ mode, cycle });
  playback.current = { mode, cycle };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false, raf = 0;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReady(false);
    loadSheet(heroKey).then(sheet => {
      if (disposed) return;
      const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      let start = performance.now(), previousMode = playback.current.mode;
      let lastFrame = -1, announced = false;
      const draw = (now: number) => {
        if (disposed) return;
        if (previousMode !== playback.current.mode) { start = now; previousMode = playback.current.mode; }
        const frame = heroFrame(playback.current.mode, (now - start) / 1000, playback.current.cycle, media.matches);
        if (!document.hidden && frame !== lastFrame) {
          ctx.clearRect(0, 0, 384, 384);
          const size = 384 / Math.max(sheet.cellWidth, sheet.cellHeight);
          const width = sheet.cellWidth * size, height = sheet.cellHeight * size;
          ctx.save();
          if (heroKey === 'qb' && frame < 5) { ctx.translate(384, 0); ctx.scale(-1, 1); }
          ctx.drawImage(sheet.canvas, (frame % 3) * sheet.cellWidth, Math.floor(frame / 3) * sheet.cellHeight, sheet.cellWidth, sheet.cellHeight,
            (384 - width) / 2, 384 * 0.96 - sheet.bottoms[frame] * size, width, height);
          ctx.restore();
          lastFrame = frame; if (!announced) { setReady(true); announced = true; }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }).catch(() => { if (!disposed) setReady(false); });
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [heroKey]);
  return <canvas ref={canvasRef} width={384} height={384} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}
    data-ready={ready ? '1' : '0'} className={`fhq-modern-hero absolute inset-0 w-full h-full object-contain pointer-events-none ${className}`}
    style={{ opacity: ready ? 1 : 0, transformOrigin: '50% 96%', animation: mode === 'idle' ? 'fhq-modern-breathe 2.8s ease-in-out infinite' : undefined, transform: facing > 0 ? 'scaleX(-1)' : undefined }} />;
}
