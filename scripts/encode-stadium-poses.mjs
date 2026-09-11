import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
const frames=[];const bounds=[];
for(const source of ['skill','action']){
 const {data,info}=await sharp(`art/players/stadium/${source}-source-v1.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info;
 // Chroma removal only, preserving painted white, skin and black uniform details.
 for(let i=0;i<data.length;i+=4){if(data[i]>45&&data[i+2]>45&&data[i+1]<Math.min(data[i],data[i+2])*.72){data[i+3]=0;data[i]=data[i+1]=data[i+2]=0;}}
 const visited=new Uint32Array(w*h),parts=[];
 for(let n=0;n<w*h;n++){
  if(visited[n]||!data[n*4+3])continue;
  const todo=[n];visited[n]=n+1;let minX=w,minY=h,maxX=0,maxY=0,count=0;
  while(todo.length){const p=todo.pop(),x=p%w,y=Math.floor(p/w);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!visited[q]&&data[q*4+3]){visited[q]=n+1;todo.push(q);}
  }
  if(count>3000)parts.push({id:n+1,left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1});
 }
 if(parts.length!==16)throw new Error(`${source}: expected 16 disconnected players, found ${parts.length}`);
 parts.sort((a,b)=>Math.floor((a.top+a.height/2)/(h/4))-Math.floor((b.top+b.height/2)/(h/4))||a.left-b.left);
 for(const b of parts){
  const isolated=Buffer.alloc(b.width*b.height*4);
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){const sourceIndex=(b.top+y)*w+b.left+x;if(visited[sourceIndex]===b.id)data.copy(isolated,(y*b.width+x)*4,sourceIndex*4,sourceIndex*4+4);}
  const image=await sharp(isolated,{raw:{width:b.width,height:b.height,channels:4}}).resize({width:Math.round(b.width*.37),height:Math.round(b.height*.37)}).toBuffer({resolveWithObject:true});
  const index=frames.length;
  frames.push({input:image.data,raw:{width:image.info.width,height:image.info.height,channels:4},left:(index%8)*128+Math.round((128-image.info.width)/2),top:Math.floor(index/8)*160+154-image.info.height});
  bounds.push({source,...b});
 }
}
await sharp({create:{width:1024,height:640,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).webp({quality:92,alphaQuality:100}).toFile('art/players/stadium/poses-v1.webp');
await writeFile('art/players/stadium/poses-v1.json',JSON.stringify({cellWidth:128,cellHeight:160,columns:8,frames:bounds},null,2)+'\n');
console.log('Encoded 32 isolated football action poses.');
