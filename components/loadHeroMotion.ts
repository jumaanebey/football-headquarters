import { heroPixelOwners } from '../game/heroPixelOwners';
import { loadHeroSignatures } from './loadHeroSignatures';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import { HERO_ATLAS } from '../game/heroAtlas';
import { keyHeroPixels } from '../game/heroAnimation';
const cache = new Map<string, Promise<HTMLCanvasElement[]>>();
export function loadHeroMotion(key: string): Promise<HTMLCanvasElement[]> {
  const bounds = HERO_MOTION_BOUNDS[key];
  if (!bounds) return Promise.resolve([]);
  if (!cache.has(key)) cache.set(key, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => { try {
      const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight;
      const ctx = source.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Canvas unavailable');
      ctx.drawImage(image, 0, 0); const pixels = ctx.getImageData(0, 0, source.width, source.height); keyHeroPixels(pixels.data); ctx.putImageData(pixels, 0, 0);
      const owners = heroPixelOwners(pixels.data, source.width, source.height, bounds);
      const original = HERO_ATLAS[key];
      const baseScale = Math.min(340 / Math.max(...original.map(b => b[2]-b[0])), 346 / Math.max(...original.map(b => b[3]-b[1])));
      const scale = Math.min((original[0][3]-original[0][1])*baseScale/(bounds[0][3]-bounds[0][1]), 340/Math.max(...bounds.map(b=>b[2]-b[0])), 346/Math.max(...bounds.map(b=>b[3]-b[1])));
      const frames = bounds.map(([x,y,right,bottom], index) => {
        const frame=document.createElement('canvas'); frame.width=frame.height=256;
        const target=frame.getContext('2d'); if(!target) throw Error('Canvas unavailable');
        const crop=document.createElement('canvas'); crop.width=right-x; crop.height=bottom-y;
        const clean=ctx.getImageData(x,y,crop.width,crop.height);
        for(let yy=0;yy<crop.height;yy++) for(let xx=0;xx<crop.width;xx++) {
          const owner=owners[(y+yy)*source.width+x+xx];
          if(owner>=0 && owner!==index) clean.data[(yy*crop.width+xx)*4+3]=0;
        }
        crop.getContext('2d')!.putImageData(clean,0,0);
        target.scale(2/3,2/3);
        const w=crop.width*scale,h=crop.height*scale;
        target.drawImage(crop,192-w/2,370-h,w,h);
        return frame;
      });
      const reactions = await loadHeroSignatures(key, true).catch(()=>[]);
      resolve([...frames,...reactions]);
    } catch(error) {cache.delete(key);reject(error);} };
    image.onerror=()=>{cache.delete(key);reject(Error('Motion art unavailable'));};
    image.src=`/assets/heroes/motion/${key}.webp`;
  }));
  return cache.get(key)!;
}
