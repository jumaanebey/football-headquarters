import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BuildingSprite} from '../components/BuildingArt';
import {MatteSprite} from '../components/MatteSprite';
import {openCampusArt} from '../game/artGate';
import '../tailwind.css';
const names=['JUGS Machine','Tackling Sled','Ref Tower','T-Shirt Cannon','Hydration Station'];
const slugs=['jugs-machine','tackling-sled','ref-tower','tshirt-cannon','gatorade-station'];
const oldCells=[[2,3,4],[5,6,-1],[7,8,9],[10,11,12],[13,14,15]];
function Gallery(){const[light,setLight]=useState(false),[before,setBefore]=useState(false);return <main style={{fontFamily:'system-ui',padding:12,color:light?'#0f172a':'white',background:light?'#dcf4c6':'#10261a',minHeight:'100vh'}}><h1>Equipment · all upgrade tiers</h1><button onClick={()=>setLight(x=>!x)}>Toggle turf</button> · <button onClick={()=>setBefore(x=>!x)}>{before?'Show redesign':'Show previous art'}</button>{slugs.map((slug,i)=><section key={slug}><h2 style={{fontSize:16,marginTop:12}}>{names[i]}</h2><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>{[1,2,3].map((tier,j)=>{const src=`/assets/battle/${slug}${tier===1?'':`-${tier}`}.webp`,cell=oldCells[i][j];return <article key={tier} style={{border:'1px solid #64816b',borderRadius:10,padding:8}}><p>Level {[1,4,8][j]}</p>{before&&cell>=0?<MatteSprite src="/assets/battle/field-equipment-cutouts.webp" region={[cell%4/4,Math.floor(cell/4)/4,.25,.25]} fallback={src}/>:before?<img src={src}/>:<BuildingSprite src={src} alt={`${names[i]} level ${[1,4,8][j]}`}/>}</article>;})}</div></section>)}</main>;}
if(import.meta.env.DEV){openCampusArt();createRoot(document.getElementById('root')!).render(<Gallery/>);}
