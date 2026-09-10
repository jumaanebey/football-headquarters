/** Coarse opaque outline for a facility's hit area; transparent atlas padding is not clickable. */
export function campusSilhouette(data: Uint8ClampedArray, width: number, height: number) {
  const left: [number,number][] = [], right: [number,number][] = [];
  let bottom = 0, top = height, minX = width, maxX = 0;
  const step = Math.max(1,Math.ceil(height/24));
  for(let y=0;y<height;y+=step){
    let min=width,max=-1,last=y;
    for(let row=y;row<Math.min(height,y+step);row++)for(let x=0;x<width;x++){
      if(data[(row*width+x)*4+3]>=40){min=Math.min(min,x);max=Math.max(max,x);last=Math.max(last,row);}
    }
    if(max<0)continue;
    bottom=Math.max(bottom,last+1);top=Math.min(top,y);minX=Math.min(minX,min);maxX=Math.max(maxX,max+1);
    left.push([Math.max(0,min-4),y],[Math.max(0,min-4),Math.min(height,y+step)]);
    right.push([Math.min(width,max+5),y],[Math.min(width,max+5),Math.min(height,y+step)]);
  }
  if(!left.length)return null;
  return {left:minX/width,right:maxX/width,top:top/height,bottom:bottom/height,clipPath:`polygon(${[...left,...right.reverse()].map(([x,y])=>`${(100*x/width).toFixed(2)}% ${(100*y/height).toFixed(2)}%`).join(',')})`};
}
