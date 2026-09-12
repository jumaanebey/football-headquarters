/** Presentation only: no random rolls, rewards or club mutations. Coordinates are yards. */
export interface FieldPoint {x:number;y:number}
export interface ReturnActor extends FieldPoint {id:string;side:'return'|'cover';role:string;moving:boolean;lean:number}
export interface ReturnPerformance {actors:ReturnActor[];ball:FieldPoint;beat:string}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const mix=(a:number,b:number,t:number)=>a+(b-a)*clamp(t);
const route=(points:FieldPoint[],t:number)=>{
 const f=clamp(t)*(points.length-1),i=Math.min(points.length-2,Math.floor(f));
 return {x:mix(points[i].x,points[i+1].x,f-i),y:mix(points[i].y,points[i+1].y,f-i)};
};
/** The return begins at the saved catch spot; kickoff flight is a separate sequence. */
export function returnPerformance(start:number,end:number,lane:'left'|'middle'|'right',time:number,direction:1|-1=1,scored=false):ReturnPerformance{
 const t=clamp(time),side=lane==='left'?-1:lane==='right'?1:0;
 const advance=(v:number)=>start+direction*v;
 const distance=(end-start)*direction;
 const progress=t<.18?0:t<.46?((t-.18)/.28)*.28:.28+((t-.46)/.54)*.72;
 const runner=route([{x:start,y:26.667},{x:advance(distance*.18),y:26.667+side*8},{x:advance(distance*.38),y:26.667+side*11},{x:end,y:26.667+side*7}],progress);
 const moving=t>.18&&t<1;
 const actors:ReturnActor[]=[{...runner,id:'returner',side:'return',role:'Returner',moving,lean:t>.39&&t<.58?-side*9:direction*3}];
 // Each blocker moves toward an engagement point, then holds it; no global row translation.
 for(let i=0;i<10;i++){
  const y=5+i*4.8,x=advance(6+(i%2)*3),engage=clamp((t-.12)/(.32+(i%3)*.05));
  actors.push({id:`block-${i}`,side:'return',role:'Blocker',x:mix(x,advance(13+(i%3)*2),engage),y:mix(y,y+side*2,engage),moving:engage>0&&engage<1,lean:direction*5});
 }
 // Two pursuit players close from different depths. Others engage instead of chasing in unison.
 for(let i=0;i<11;i++){
  const y=3+i*4.7,x=advance(17+(i%3)*3);
  const pursuit=i===4||i===8;
  const chase=clamp((t-(i===4?.35:.47))/.53);
  const close=i===4&&!scored?1:.72;
  actors.push({id:`cover-${i}`,side:'cover',role:pursuit?'Pursuit':'Coverage',
   x:pursuit?mix(x,runner.x-direction*(1-close)*5,chase*close):mix(x,advance(13+(i%3)*2)+direction*1.8,clamp(t/.45)),
   y:pursuit?mix(y,runner.y+1.3,chase*close):mix(y,5+Math.min(i,9)*4.8+side*2,clamp(t/.45)),
   moving:t>.1&&t<1,lean:-direction*4});
 }
 return {actors,ball:{x:runner.x+direction*.7,y:runner.y-.4},beat:t<.18?'Secure the catch':t<.46?'Set up the block':t<.76?'Plant and accelerate':t<1?'Pursuit closes':distance>=55?'Return completed · breakaway example':'Return completed · contained example'};
}
