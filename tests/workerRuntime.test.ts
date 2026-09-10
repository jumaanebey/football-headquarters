import {beforeAll,describe,it,expect,vi} from 'vitest';
import {build} from 'esbuild';
import vm from 'node:vm';
let source='';
beforeAll(async()=>{source=(await build({entryPoints:['pwa/sw.ts'],bundle:true,write:false,format:'iife',define:{__SW_VERSION__:'"new"',__PRECACHE__:'["/","/assets/index-new.js","/assets/CampusEditor-new.js"]'}})).outputFiles[0].text;});
async function runtime({quota=false,offline=false,cacheDenied=false,installFailed=false}={}){
 const stores=new Map<string,Map<string,Response>>();
 const url=(r:Request|string)=>typeof r==='string'?new URL(r,'https://game.test').href:r.url;
 const open=async(name:string)=>{if(cacheDenied)throw Error('private mode');let store=stores.get(name);if(!store){store=new Map();stores.set(name,store);}return {
  match:async(r:Request|string)=>store!.get(url(r))?.clone(),
  addAll:async(keys:string[])=>{for(const key of keys){store!.set(url(key),new Response(name+key));if(installFailed)throw Error('partial install');}},
  put:async(r:Request|string,v:Response)=>{if(quota)throw Error('quota');store!.set(url(r),v);},
  keys:async()=>[...store!.keys()].map(k=>new Request(k)),delete:async(r:Request|string)=>store!.delete(url(r))};};
 const caches={open,keys:async()=>[...stores.keys()],delete:async(n:string)=>stores.delete(n),match:async(r:Request|string)=>{if(cacheDenied)throw Error('denied');for(const s of stores.values()){const hit=s.get(url(r));if(hit)return hit.clone();}}};
 const handlers:Record<string,(event:any)=>void>={};const network=vi.fn(async()=>{if(offline)throw Error('offline');return new Response('network');});
 const self={location:{origin:'https://game.test'},clients:{claim:vi.fn()},skipWaiting:vi.fn(),addEventListener:(k:string,h:(e:any)=>void)=>handlers[k]=h};
 vm.runInNewContext(source,{self,caches,fetch:network,URL,Response,Request,Set});
 const run=async(kind:string,request?:Request)=>{const waits:Promise<unknown>[]=[];let response:Promise<Response>|undefined;handlers[kind]({request,waitUntil:(p:Promise<unknown>)=>waits.push(p),respondWith:(p:Promise<Response>)=>response=p});const answer=await response;await Promise.all(waits);return answer;};
 return {stores,open,run,network};
}
describe('bundled worker runtime fault cases',()=>{
 it('keeps a successful network response when cache writes exceed quota',async()=>{const r=await runtime({quota:true});const reply=await r.run('fetch',new Request('https://game.test/assets/qb.12345678.webp'));expect(await reply?.text()).toBe('network');});
 it('keeps network play available when CacheStorage is denied',async()=>{const r=await runtime({cacheDenied:true});const reply=await r.run('fetch',new Request('https://game.test/assets/qb.webp'));expect(await reply?.text()).toBe('network');});
 it('retains two older shells for old tabs and serves their precached lazy editor offline',async()=>{const r=await runtime({offline:true});for(const v of ['oldest','old','previous','new']){await (await r.open(`fhq-shell-${v}`)).addAll([`/assets/CampusEditor-${v}.js`]);await r.open(`fhq-art-${v}`);}await r.open('unrelated');await r.run('activate');expect(r.stores.has('fhq-shell-oldest')).toBe(false);expect(r.stores.has('unrelated')).toBe(true);const reply=await r.run('fetch',new Request('https://game.test/assets/CampusEditor-old.js'));expect(await reply?.text()).toContain('fhq-shell-old');expect(r.network).not.toHaveBeenCalled();});
 it('fails a partial install and removes its incomplete shell',async()=>{const r=await runtime({installFailed:true});await expect(r.run('install')).rejects.toThrow('partial install');expect(r.stores.has('fhq-shell-new')).toBe(false);});
 it('does not intercept auth, analytics or club requests',async()=>{const r=await runtime();expect(await r.run('fetch',new Request('https://server.test/functions/v1/club-authority',{method:'POST'}))).toBeUndefined();expect(r.network).not.toHaveBeenCalled();});
});

it('kill-switch cleanup leaves other origin caches and saved club data untouched',async()=>{
 const {readFileSync}=await import('node:fs');const callbacks:Record<string,(event:any)=>void>={};const deleted:string[]=[];const navigate=vi.fn();let completion:Promise<unknown>|undefined;
 const store=new Map([['fhq_save_v1','confirmed club']]);
 vm.runInNewContext(readFileSync('pwa/sw-killswitch.js','utf8'),{self:{addEventListener:(k:string,f:(e:any)=>void)=>callbacks[k]=f,registration:{unregister:vi.fn()},clients:{matchAll:async()=>[{url:'https://game.test',navigate}]}},caches:{keys:async()=>['fhq-shell-old','fhq-art-old','fhq-other-feature','unrelated'],delete:async(k:string)=>{deleted.push(k);}},localStorage:store});
 callbacks.activate({waitUntil:(p:Promise<unknown>)=>completion=p});await completion;
 expect(deleted).toEqual(['fhq-shell-old','fhq-art-old']);expect(store.get('fhq_save_v1')).toBe('confirmed club');expect(navigate).toHaveBeenCalledWith('https://game.test');
});
it('prefers refreshed current art over retained copies and activates despite denied storage',async()=>{
 const r=await runtime();await (await r.open('fhq-art-previous')).put('/assets/ball.webp',new Response('old'));
 const first=await r.run('fetch',new Request('https://game.test/assets/ball.webp'));expect(await first?.text()).toBe('old');
 const next=await r.run('fetch',new Request('https://game.test/assets/ball.webp'));expect(await next?.text()).toBe('network');
 await expect((await runtime({cacheDenied:true})).run('activate')).resolves.toBeUndefined();
});
