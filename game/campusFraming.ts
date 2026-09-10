export interface CampusRect { left: number; top: number; right: number; bottom: number }
/** Fit actionable campus content, not the much larger decorative canvas. */
export function frameCampus(rects: CampusRect[], width: number, height: number, reservedHeight = 260) {
  const bounds = rects.length ? {
    left: Math.min(...rects.map(r => r.left)), top: Math.min(...rects.map(r => r.top)),
    right: Math.max(...rects.map(r => r.right)), bottom: Math.max(...rects.map(r => r.bottom)),
  } : {left:0,top:0,right:1180,bottom:820};
  const safeWidth = Math.max(120,width-32), safeHeight = Math.max(100,height-reservedHeight);
  const scale = Math.min(1.15,safeWidth/Math.max(1,bounds.right-bounds.left),safeHeight/Math.max(1,bounds.bottom-bounds.top));
  return {scale, centerX:(bounds.left+bounds.right)/2,centerY:(bounds.top+bounds.bottom)/2,bounds};
}
