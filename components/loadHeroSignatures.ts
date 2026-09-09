import { keyHeroPixels } from '../game/heroAnimation';
import { HERO_SIGNATURE_ATLAS, signatureRegistration } from '../game/heroSignatureAtlas';

const sheets = new Map<string, Promise<HTMLCanvasElement[]>>();
export function loadHeroSignatures(key: string): Promise<HTMLCanvasElement[]> {
  const spec = HERO_SIGNATURE_ATLAS[key];
  if (!spec) return Promise.resolve([]);
  if (!sheets.has(key)) sheets.set(key, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        keyHeroPixels(data.data); ctx.putImageData(data, 0, 0);
        const frames = signatureRegistration(key, data.data, canvas.width, canvas.height).map(frame => {
          const out = document.createElement('canvas'); out.width = out.height = 384;
          const target = out.getContext('2d');
          if (!target) throw new Error('Canvas unavailable');
          target.drawImage(canvas, frame.x, frame.y, frame.w, frame.h, frame.dx, frame.dy, frame.w * frame.scale, frame.h * frame.scale);
          return out;
        });
        resolve(frames);
      } catch (error) { sheets.delete(key); reject(error); }
    };
    image.onerror = () => { sheets.delete(key); reject(new Error('Signature art unavailable')); };
    image.src = spec.src;
  }));
  return sheets.get(key)!;
}
