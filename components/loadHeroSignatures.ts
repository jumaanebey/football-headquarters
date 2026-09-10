import { keyHeroPixels } from '../game/heroAnimation';
import { HERO_SIGNATURE_ATLAS, signatureRegistration } from '../game/heroSignatureAtlas';

const sheets = new Map<string, Promise<HTMLCanvasElement[]>>();
export function loadHeroSignatures(key: string, reaction = false): Promise<HTMLCanvasElement[]> {
  const spec = reaction ? ['qb','enforcer'].includes(key) ? {src:`/assets/heroes/reactions/${key}.webp`,anchorX:[.5,.5,.5,.5],stature:.92} : undefined : HERO_SIGNATURE_ATLAS[key];
  const cacheKey = `${reaction ? 'reaction' : 'signature'}:${key}`;
  if (!spec) return Promise.resolve([]);
  if (!sheets.has(cacheKey)) sheets.set(cacheKey, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        keyHeroPixels(data.data); ctx.putImageData(data, 0, 0);
        const frames = signatureRegistration(key, data.data, canvas.width, canvas.height, spec).map(frame => {
          const out = document.createElement('canvas'); out.width = out.height = 256;
          const target = out.getContext('2d');
          if (!target) throw new Error('Canvas unavailable');
          target.scale(2 / 3, 2 / 3);
          target.drawImage(canvas, frame.x, frame.y, frame.w, frame.h, frame.dx, frame.dy, frame.w * frame.scale, frame.h * frame.scale);
          return out;
        });
        resolve(frames);
      } catch (error) { sheets.delete(cacheKey); reject(error); }
    };
    image.onerror = () => { sheets.delete(cacheKey); reject(new Error('Signature art unavailable')); };
    image.src = spec.src;
  }));
  return sheets.get(cacheKey)!;
}
