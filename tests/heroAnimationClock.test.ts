import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeHeroAnimation } from '../components/heroAnimationClock';
afterEach(()=>vi.unstubAllGlobals());
describe('shared cosmetic hero clock',()=>{
 it('uses one animation frame for many actors and releases it after unmount',()=>{
  const raf=vi.fn((_callback:(time:number)=>void)=>7),cancel=vi.fn(),add=vi.fn(),remove=vi.fn();
  vi.stubGlobal('requestAnimationFrame',raf);vi.stubGlobal('cancelAnimationFrame',cancel);
  vi.stubGlobal('document',{hidden:false,addEventListener:add,removeEventListener:remove});
  const listeners=Array.from({length:27},()=>vi.fn());
  const off=listeners.map(subscribeHeroAnimation);
  expect(raf).toHaveBeenCalledTimes(1);
  const tick=raf.mock.calls[0][0] as unknown as (time:number)=>void;
  tick(100);expect(listeners.every(fn=>fn.mock.calls.length===1)).toBe(true);
  off.forEach(unsubscribe=>unsubscribe());expect(cancel).toHaveBeenCalledWith(7);expect(remove).toHaveBeenCalledTimes(1);
 });
 it('does not schedule hidden tabs and resumes on visibility change',()=>{
  const raf=vi.fn(()=>8),cancel=vi.fn();let visibility=()=>{};
  const doc={hidden:true,addEventListener:(_name:string,fn:()=>void)=>{visibility=fn},removeEventListener:vi.fn()};
  vi.stubGlobal('requestAnimationFrame',raf);vi.stubGlobal('cancelAnimationFrame',cancel);vi.stubGlobal('document',doc);
  const off=subscribeHeroAnimation(()=>{});expect(raf).not.toHaveBeenCalled();
  doc.hidden=false;visibility();expect(raf).toHaveBeenCalledTimes(1);off();
 });
});
