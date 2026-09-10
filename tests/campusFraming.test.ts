import {expect,it} from 'vitest';
import {frameCampus} from '../game/campusFraming';
it.each([[320,740],[390,844],[430,932],[768,1024],[1440,900],[844,390]])('fits all actionable bounds at %sx%s including moved facilities', (width,height) => {
  const rects=[{left:80,right:370,top:120,bottom:430},{left:750,right:1090,top:380,bottom:720}];
  const f=frameCampus(rects,width,height);
  for(const r of rects) {
    expect(Math.abs((r.left-f.centerX)*f.scale)).toBeLessThanOrEqual((width-32)/2+.01);
    expect(Math.abs((r.right-f.centerX)*f.scale)).toBeLessThanOrEqual((width-32)/2+.01);
    expect(Math.abs((r.top-f.centerY)*f.scale)).toBeLessThanOrEqual(Math.max(100,height-260)/2+.01);
    expect(Math.abs((r.bottom-f.centerY)*f.scale)).toBeLessThanOrEqual(Math.max(100,height-260)/2+.01);
  }
});
it('fills more space when the custom campus is compact without changing its coordinates',()=>{
  const rects=[{left:400,right:800,top:300,bottom:700}];const saved=JSON.stringify(rects);
  expect(frameCampus(rects,390,844).scale).toBeGreaterThan(.8);
  expect(JSON.stringify(rects)).toBe(saved);
});
