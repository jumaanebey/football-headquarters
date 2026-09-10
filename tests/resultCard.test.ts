import {afterEach,expect,it,vi} from 'vitest';
import {resultCard} from '../components/ResultShare';
afterEach(()=>vi.unstubAllGlobals());
it('exports a 1200×630 result using visible match fields without currency or private extras',async()=>{
 const lines:string[]=[];
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:0,font:'',fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},measureText:(s:string)=>({width:s.length*20}),fillText:(s:string)=>lines.push(s)};
 const canvas={width:0,height:0,getContext:()=>ctx,toBlob:(done:(blob:Blob)=>void)=>done(new Blob(['png'],{type:'image/png'}))};
 vi.stubGlobal('document',{createElement:()=>canvas});
 const match={week:1,opponent:'Campaign Coach',ourScore:2,theirScore:0,won:true,reward:98765,access_token:'secret-not-for-card'};
 const blob=await resultCard('Club <script>',match);
 expect([canvas.width,canvas.height]).toEqual([1200,630]); expect(blob.type).toBe('image/png');
 expect(lines).toContain('2 / 3 GAME BALLS'); expect(lines).toContain('VICTORY'); expect(lines.join(' ')).not.toMatch(/98765|secret-not-for-card/);
});
it('reports unsupported image export instead of silently hanging',async()=>{
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>null})});
 await expect(resultCard('Club',{week:1,opponent:'Rival',ourScore:0,theirScore:0,won:false,reward:0})).rejects.toThrow('Image export unavailable');
});
