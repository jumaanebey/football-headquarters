import type {StageActor} from './stadiumPerformance';

type Point={x:number;y:number};
export interface DefensiveContext {
 start:number;end:number;direction:1|-1;away:boolean;time:number;active:boolean;
 kind:'run'|'pass'|'kick';call:string;target:Point;receivers:Point[];scored:boolean;complete:boolean;
}
const phase=(t:number,a:number,b:number)=>Math.max(0,Math.min(1,(t-a)/(b-a)));
const blend=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
/** Assignment paths render an existing result. They never roll a tackle or change yardage. */
export function defensiveAssignments(c:DefensiveContext):StageActor[]{
 const {start,end,direction:d,away,kind,call,target,receivers}=c,t=c.active?c.time:0;
 const run=kind==='run',kick=kind==='kick',man=call==='man',stack=call==='stack';
 const actors:StageActor[]=[];
 const put=(id:string,p:Point,pose:number,large=false,label?:string)=>actors.push({id,x:Math.max(-9,Math.min(109,p.x)),y:Math.max(2,Math.min(51,p.y)),away:!away,facing:-d as 1|-1,pose,large,label});
 // Four rushers meet a specific shoulder, then work around it. Ends keep the outside arm free.
 for(let i=0;i<4;i++){
  const edge=i===0||i===3,side=i<2?-1:1;
  const set={x:start+2*d,y:21+i*4};
  const contact={x:start+.9*d,y:20+(i+(i>1?1:0))*3.2};
  const shed={x:start+(edge?-1.5:.2)*d,y:contact.y+side*(edge?3:1.2)};
  const rush={x:start-(kick?5:3)*d,y:27+side*(edge?3.5:1.8)};
  let p=blend(set,contact,phase(t,.12,.32));
  p=blend(p,shed,phase(t,.38,.61));
  p=blend(p,run?{x:start+2*d,y:target.y+side*3}:rush,phase(t,.64,.91));
  put(`dl${i}`,p,t<.12?20:t<.32?21:t<.61?22:4+Math.floor(t*24+i)%4,true);
 }
 // Three linebackers read first; four defensive backs preserve width and depth.
 const sets=[{x:start+6*d,y:19},{x:start+7*d,y:27},{x:start+6*d,y:35},
  {x:start+5*d,y:9},{x:start+5*d,y:44},{x:start+17*d,y:19},{x:start+19*d,y:36}];
 for(let i=0;i<7;i++){
  const lb=i<3,safety=i>=5,set=sets[i],side=i%2?-1:1;
  let assignment:Point;
  if(kick) assignment={x:start-(i<3?4:0)*d,y:27+(i-3)*3};
  else if(run){
   // Stack attacks its gap earlier; the opposite linebacker protects the cutback.
   assignment={x:start+(lb?(stack?1:3):safety?13:5)*d,y:lb?23+i*3: set.y};
  }else if(man){
   const r=receivers[i===3?0:i===4?3:i%4];
   assignment={x:r.x+(safety?6:1.6)*d,y:r.y+side*(safety?4:1.5)};
  }else{
   // Underneath hook/flat defenders and two deep halves; eyes stay on the release.
   assignment={x:start+(lb?(stack?3:9):safety?23:12)*d,y:lb?14+i*12:set.y};
  }
  let p=blend(set,assignment,phase(t,run?(stack?.17:.25):.14,run?.55:.62));
  if(!kick){
   const closeStart=run?(lb?.55:.7):.76;
   // Only the nearest defender closes to contact. Others retain pursuit leverage.
   const finisher=run?i===1:(man?i===3:i===0);
   const finish={x:end+(finisher?1.1:3+Math.abs(i-3)*1.5)*d,y:target.y+(finisher?1.1:side*(3+i*.65))};
   // A score stays clear of the defender; there is no invented goal-line tackle.
   if(c.scored&&finisher)finish.x=end-3*d;
   p=blend(p,finish,phase(t,closeStart,1)*(finisher?1:run?.62:safety?.48:.32));
   const contest=!run&&finisher&&t>.76&&t<.9;
   const contact=finisher&&t>.96&&!c.scored&&(run||c.complete);
   put(`db${i}`,p,t<.14?20:contact?23:contest?13:t<.55?21:4+Math.floor(t*24+i)%4,false,
    i===1&&run?'Gap fit':i===5&&!run?'Deep safety':undefined);
  }else put(`db${i}`,p,t<.2?20:t<.6?22:13);
 }
 return actors;
}
