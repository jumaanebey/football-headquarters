import React, { useEffect, useRef, useState } from 'react';
import { keyHeroPixels } from '../game/heroAnimation';

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
          keyHeroPixels(pixels.data);
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

/** Square scenery sheets retain their original framing; only the matte disappears. */
export function MatteSprite({ src, fallback, alt = '', className, style }: {
  src: string; fallback: string; alt?: string; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [readySource, setReadySource] = useState('');
  const ready = readySource === src;
  useEffect(() => {
    let disposed = false;
    loadSheet(src).then(sheet => {
      if (disposed) return;
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 512, 512);
      ctx.drawImage(sheet, 0, 0, 512, 512);
      setReadySource(src);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [src]);
  return <span className={className} style={{ display: 'block', position: 'relative', ...style }}>
    <img src={fallback} alt={ready ? '' : alt} draggable={false}
      style={{ display: 'block', width: '100%', height: 'auto', visibility: ready ? 'hidden' : undefined }} />
    <canvas ref={ref} width={512} height={512} role={alt ? 'img' : undefined} aria-label={alt || undefined}
      aria-hidden={!alt || undefined} data-sprite={src} data-ready={ready ? '1' : '0'}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: ready ? 1 : 0, pointerEvents: 'none' }} />
  </span>;
}
