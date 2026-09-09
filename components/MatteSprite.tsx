import React, { useEffect, useRef, useState } from 'react';
import { keySceneryPixels } from '../game/sceneryMatte';

const sheets = new Map<string, Promise<HTMLCanvasElement>>();
function loadSheet(src: string) {
  if (!sheets.has(src)) {
    sheets.set(src, new Promise<HTMLCanvasElement>((resolve, reject) => {
      const image = new Image();
      const fail = () => { sheets.delete(src); reject(new Error('Sprite unavailable')); };
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) { fail(); return; }
          ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          keySceneryPixels(pixels.data);
          ctx.putImageData(pixels, 0, 0);
          resolve(canvas);
        } catch { fail(); }
      };
      image.onerror = fail;
      image.src = src;
    }));
  }
  return sheets.get(src)!;
}

/** A normalized atlas region retains the source sprite's framing and aspect ratio. */
export function MatteSprite({ src, fallback, alt = '', className, style, region = [0, 0, 1, 1], underlay }: {
  src: string; fallback: string; alt?: string; className?: string; style?: React.CSSProperties;
  region?: readonly [number, number, number, number];
  underlay?: React.ReactNode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [readySource, setReadySource] = useState('');
  const [x, y, width, height] = region;
  // Upgrades can change cells within the same loaded sheet. Never show the old
  // building while the next cell is preparing, or redraw on unrelated ticks.
  const sourceKey = `${src}:${x},${y},${width},${height}`;
  const ready = readySource === sourceKey;
  useEffect(() => {
    let disposed = false;
    loadSheet(src).then(sheet => {
      if (disposed) return;
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      const canvas = ref.current!;
      canvas.width = 512;
      canvas.height = Math.round(512 * sheet.height * height / (sheet.width * width));
      ctx.drawImage(sheet, sheet.width * x, sheet.height * y,
        sheet.width * width, sheet.height * height, 0, 0, canvas.width, canvas.height);
      setReadySource(sourceKey);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [src, sourceKey, x, y, width, height]);
  return <span className={className} style={{ display: 'block', position: 'relative', ...style }}>
    <img src={fallback} alt={ready ? '' : alt} draggable={false}
      style={{ display: 'block', width: '100%', height: 'auto', visibility: ready ? 'hidden' : undefined }} />
    {ready && underlay}
    <canvas ref={ref} width={512} height={512} role={alt ? 'img' : undefined} aria-label={alt || undefined}
      aria-hidden={!alt || undefined} data-sprite={src} data-ready={ready ? '1' : '0'}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: ready ? 1 : 0, pointerEvents: 'none' }} />
  </span>;
}
