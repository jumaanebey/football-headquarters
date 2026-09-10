import sharp from 'sharp';
import { writeMotionBounds } from './motion-bounds-io.mjs';
const sources={qb:'exec-c2287a1f-4c79-4678-a6c2-94899e1094b4.png',enforcer:'exec-562d0a01-994f-4a8c-92fa-776970513657.png'};
const bounds={};
for(const [key,file] of Object.entries(sources)){
const src='/Users/j.beymacbookpro/.codex/generated_images/01a088da-25ba-7050-8669-27046261a52c/'+file;
await sharp(src).webp({lossless:true}).toFile(`public/assets/heroes/motion/${key}.webp`);
const {data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});const {width:w,height:h}=info;const mask=new Uint8Array(w*h);
for(let i=0;i<w*h;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];mask[i]=!(r>110&&b>100&&Math.min(r,b)-g>75)?1:0;}
const comps=[];
for(let i=0;i<mask.length;i++){if(!mask[i])continue;let queue=[i],start=0,xmin=w,ymin=h,xmax=0,ymax=0;mask[i]=0;while(start<queue.length){const j=queue[start++],x=j%w,y=Math.floor(j/w);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);for(const k of [x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1])if(k>=0&&mask[k]){mask[k]=0;queue.push(k);}}if(queue.length>300)comps.push({area:queue.length,b:[Math.max(0,xmin-2),Math.max(0,ymin-2),Math.min(w,xmax+3),Math.min(h,ymax+3)]});}
const largest=comps.sort((a,b)=>b.area-a.area).slice(0,32).map(c=>c.b);largest.sort((a,b)=>(Math.round(((a[1]+a[3])/2)/h*4-.5)-Math.round(((b[1]+b[3])/2)/h*4-.5))||a[0]-b[0]);bounds[key]=largest;console.log(key,comps.length,largest.length,info.width,info.height);
}
writeMotionBounds(bounds); // merges into the existing file: the seven roster heroes keep their bounds
