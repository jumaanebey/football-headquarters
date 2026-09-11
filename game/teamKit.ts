import type { CLUB_STYLES } from './clubStyle';
export type TeamKit = typeof CLUB_STYLES[number];
/** Material palette: recolor cool navy cloth/helmets, preserving warm skin, leather,
 * orange details, neutral whites, alpha and ink outlines. Never mutate source art. */
export function tintUniformPixels(pixels:Uint8ClampedArray,primary:string) {
  if(!/^#[0-9a-f]{6}$/i.test(primary))return;
  const rgb=[1,3,5].map(i=>parseInt(primary.slice(i,i+2),16));
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(!pixels[i+3]||b<=r+5||g<r||b>g*1.9||b<24)continue;
    const weight=Math.min(1,(b-r-5)/12)*Math.min(1,(b-24)/20);
    const shade=Math.min(1.15,.22+b/180);
    for(let c=0;c<3;c++)pixels[i+c]=Math.round(pixels[i+c]*(1-weight)+Math.min(255,rgb[c]*shade)*weight);
  }
}
const MAX_FRAMES=192,MAX_BYTES=32*1024*1024;
let cachedBytes=0;
let sourceIds=new WeakMap<object,number>(),nextId=0;
const frames=new Map<string,HTMLCanvasElement>();
/** Preserve source pixels; evict by actual byte size rather than shrinking every frame. */
export function teamKitFrame(source:HTMLCanvasElement|HTMLImageElement,kit:TeamKit):HTMLCanvasElement|HTMLImageElement {
  let id=sourceIds.get(source);if(!id){id=++nextId;sourceIds.set(source,id);}
  const identity='src' in source ? `image:${source.currentSrc||source.src}` : `canvas:${id}`;
  const key=`${identity}:${kit.id}`,cached=frames.get(key);
  if(cached){frames.delete(key);frames.set(key,cached);return cached;}
  const canvas=document.createElement('canvas');canvas.width=('naturalWidth' in source ? source.naturalWidth : source.width);canvas.height=('naturalHeight' in source ? source.naturalHeight : source.height);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return source;
  try{ctx.drawImage(source,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);tintUniformPixels(pixels.data,kit.primary);ctx.putImageData(pixels,0,0);}catch{return source;}
  const bytes=canvas.width*canvas.height*4;
  if(bytes>MAX_BYTES)return canvas;
  frames.set(key,canvas);cachedBytes+=bytes;
  while(frames.size>MAX_FRAMES||cachedBytes>MAX_BYTES){const oldest=frames.keys().next().value!;const frame=frames.get(oldest)!;cachedBytes-=frame.width*frame.height*4;frames.delete(oldest);}
  return canvas;
}
export const teamKitCacheStats=()=>({frames:frames.size,maxFrames:MAX_FRAMES,bytes:cachedBytes,maxBytes:MAX_BYTES});
export function clearTeamKitFrames(){frames.clear();cachedBytes=0;sourceIds=new WeakMap();nextId=0;}
