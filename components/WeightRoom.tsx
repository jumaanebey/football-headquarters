import React,{useEffect,useRef,useState} from 'react';
import {BuildingType,DrillState,type GameState,type BuildingInstance} from '../types';
import {DRILLS,trainingYieldMult,UPGRADE_CONFIG,upgradeDurationSecs} from '../constants';
import {playerGrowth,drillEffects} from '../game/progression/playerGrowth';
import {unitPlayerSprite} from '../assets';
import {Sheet} from './ui';

const WORKOUTS:Record<string,string>={sled_push:'Strength circuit',routes:'Explosive movement',tackle_dummy:'Power circuit',coverage:'Agility circuit',scrimmage:'Whole-team conditioning'};
export function WeightRoom({club,blocked,initialPlayer,onClose,onStart,onCollect,onUpgrade,onGameDay}:{club:GameState;blocked:boolean;initialPlayer?:string;onClose:()=>void;onStart:(unit:GameState['roster'][number]['unit'],id:string)=>void;onCollect:(b:BuildingInstance)=>void;onUpgrade:(id:string,cost:number)=>void;onGameDay:()=>void}){
 const [selected,setSelected]=useState(initialPlayer??club.roster[0]?.id);const[now,setNow]=useState(Date.now());
 const [celebrate,setCelebrate]=useState<{name:string;level:number;count:number}|null>(null);
 const previous=useRef(new Map(club.roster.map(p=>[p.id,p.level])));
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const grown=club.roster.filter(p=>p.level>(previous.current.get(p.id)??p.level));if(grown.length){const focus=grown.find(p=>p.id===selected)??grown[0];setCelebrate({name:focus.name,level:focus.level,count:grown.length})}previous.current=new Map(club.roster.map(p=>[p.id,p.level]));},[club.roster,selected]);
 const building=club.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH);
 const player=club.roster.find(p=>p.id===selected)??club.roster[0];
 if(!building||!player)return <Sheet title="Weight Room" onClose={onClose}><p className="p-5 text-white">Recruit your first player to begin working out.</p></Sheet>;
 const active=building.activeDrillId?DRILLS[building.activeDrillId]:null;
 const working=building.state===DrillState.ACTIVE;const ready=building.state===DrillState.COMPLETED;
 const participants=club.roster.filter(p=>active?(active.targetUnit==='ALL'||p.unit===building.targetUnit):p.unit===player.unit);
 const growth=playerGrowth(club,player.id,now)!;
 const effects=drillEffects(club,player.unit).filter(e=>e.targetUnit==='ALL'||e.targetUnit===player.unit);
 const progress=active?Math.min(1,Math.max(0,(now-(building.startTime??now))/(active.durationSeconds*1000))):0;
 const remaining=Math.max(0,Math.ceil(((building.finishTime??now)-now)/1000));
 const cost=Math.floor(UPGRADE_CONFIG.baseCost*Math.pow(UPGRADE_CONFIG.costMultiplier,building.level-1));
 const stadium=club.buildings.find(b=>b.type===BuildingType.STADIUM)?.level??1;
 const job=club.upgrades.find(j=>j.kind==='building'&&j.key===building.id);
 const upgradeBlocked=blocked||!!job||building.level>=stadium||club.upgrades.length>=club.builders||club.resources.COINS<cost;
 return <Sheet title="Weight Room" subtitle={`Level ${building.level} · ${club.resources.ENERGY} Energy · ${club.resources.COINS.toLocaleString()} Coins`} onClose={onClose} maxWidth="max-w-6xl">
 <div className="fhq-weight-room">
 <section className="fhq-weight-scene" aria-label="Inside your Weight Room">
 <div className="fhq-weight-room-sign"><span>PLAYER DEVELOPMENT</span><strong>Earn the next level.</strong><small>{working?`${participants.length} teammates working out`:ready?'Session complete · collect your growth':'Choose a teammate. Build your team.'}</small></div>
 <svg viewBox="0 0 720 440" role="img" aria-label={`${working?'Workout in progress':ready?'Workout complete':'Weight Room ready'}. ${participants.map(p=>p.name).join(', ')}`}>
 <defs><linearGradient id="wr-floor" x2="0" y2="1"><stop stopColor="#52616a"/><stop offset="1" stopColor="#1c2935"/></linearGradient><linearGradient id="wr-wall" x2="0" y2="1"><stop stopColor="#294558"/><stop offset="1" stopColor="#101e2c"/></linearGradient></defs>
 <path d="M40 170 360 50 680 170 360 315Z" fill="#122632"/>
 <path d="M40 170V95L360 0V50Z" fill="url(#wr-wall)"/><path d="M360 0 680 95V170L360 50Z" fill="#1d3445"/>
 <path d="M40 170 360 50 680 170V240L360 420 40 240Z" fill="url(#wr-floor)" stroke="#7b919b" strokeWidth="2"/>
 <path d="M40 170 360 50 680 170 360 350Z" fill="#354750" stroke="#87a3a4"/>
 {[0,1,2,3,4,5].map(i=><path key={i} d={`M${40+i*53} ${170+i*30} L${360+i*53} ${50+i*20}`} stroke="#68818a" strokeOpacity=".25"/>)}
 <path d="M65 110 325 32" stroke="#f5b745" strokeWidth="5"/>
 <path d="M390 33 655 110" stroke="#e3f4f4" strokeWidth="5"/>
 {[0,1,2].map(i=><g key={i} transform={`translate(${440+i*61} ${86+i*18})`}><path d="M0 0V55L42 68V13Z" fill="#263744" stroke="#8da1a9"/><path d="M9 14 33 21M9 22 33 29" stroke="#7d969e"/><circle cx="32" cy="41" r="2" fill="#f5b745"/></g>)}
 <text x="170" y="82" fill="#f8d06a" fontSize="17" fontWeight="900" transform="rotate(-16 170 82)">WORK. GROW. PLAY.</text>
 {[0,1,2,3,4,5].map(i=>{const col=i%3,row=Math.floor(i/3),x=180+col*150-row*55,y=170+col*34+row*95;const p=participants[i];return <g key={i} transform={`translate(${x} ${y})`}>
 <ellipse cy="27" rx="52" ry="20" fill="#0d1b27" opacity=".55"/>
 <path d="M-38 2 8-14 48 0 2 19Z" fill="#0b1520" stroke="#526673"/>
 <path d="M-25-20V22M30-5V37M-25-20 30-5" fill="none" stroke="#90a4ab" strokeWidth="5"/>
 {p?<g className={working?'fhq-weight-athlete is-working':ready?'fhq-weight-athlete is-ready':'fhq-weight-athlete'} style={{animationDelay:`-${i*.27}s`}}>
 <path d="M-7 5-19 21M4 8 15 29" stroke="#19232d" strokeWidth="9" strokeLinecap="round"/>
 <path d="M-7-20 4-17 7 8-10 5Z" fill={p.avatarColor||'#f59e0b'} stroke="#efdfb3" strokeWidth="1.5"/>
 <circle cx="-2" cy="-30" r="9" fill="#b87952"/><path d="M-11-31Q-2-46 7-30" fill="#1a171b"/>
 <g className="fhq-weight-arms"><path d="M-9-16-24-28M6-13 20-16" stroke="#b87952" strokeWidth="6" strokeLinecap="round"/><path d="M-34-31 32-12" stroke="#c7d4dc" strokeWidth="4"/><path d="M-29-42-36-23M30-23 23-4" stroke="#171c25" strokeWidth="10"/></g>
 <text x="-2" y="-1" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">{p.role}</text>
 </g>:<path d="M-16-12 25 1M-12-20-19-3M24-7 17 10" stroke="#71858e" strokeWidth="5"/>}
 {p&&<text x="0" y="52" textAnchor="middle" fontSize="11" fill={p.id===player.id?'#fde68a':'#e2e8f0'} fontWeight="700">{p.name.split(' ').slice(-1)[0]} · L{p.level}</text>}
 </g>})}
 {building.level>=2&&<path d="M78 231 156 269 156 289 78 251Z" fill="#af7838" stroke="#f4c570"/>}
 {building.level>=3&&<path d="M471 328 605 263 620 273 486 342Z" fill="#21855f" stroke="#5dcf99"/>}
 {building.level>=4&&<g><path d="M280 62V115L315 107V51Z" fill="#d0a347"/><text x="290" y="85" fill="#152131" fontSize="12" fontWeight="900">★</text></g>}
 {building.level>=5&&<g><path d="M407 47 490 72V99L407 74Z" fill="#071920" stroke="#67dbae"/><text x="421" y="68" fill="#6af5b0" fontSize="9" transform="rotate(17 421 68)">TEAM CIRCUIT</text></g>}
 <text x="360" y="426" textAnchor="middle" fontSize="12" fill="#cbd5e1">{participants.length>6?`Plus ${participants.length-6} teammates in the same session`:'A stronger team starts here'}</text>
 </svg>
 <div className={`fhq-weight-session ${active?'':'is-idle'}`} aria-live="polite">{active?<><strong>{WORKOUTS[active.id]??active.name}</strong><span>{ready?'Ready to collect':remaining?`${remaining}s remaining`:'Finishing your workout…'}</span><progress max="1" value={ready?1:progress}/><small>{participants.map(p=>p.name).join(' · ')}</small></>:<><strong>Your team’s home for growth</strong><span>Quick sessions. Permanent player improvements.</span></>}</div>
 </section>
 <section className="fhq-weight-controls">
 {celebrate&&<div className="fhq-weight-earned" role="status"><strong>Level {celebrate.level} · {celebrate.name}</strong><p>{celebrate.count} teammates improved. +1 Strength, Speed and IQ each.</p><button onClick={onGameDay}>Take your stronger team to Game Day →</button></div>}
 <div className="fhq-weight-player"><img src={unitPlayerSprite(player.unit)} alt=""/><label className="fhq-weight-player-label">Follow a player · next workout adds one level<select aria-label="Follow a player" value={player.id} onChange={e=>setSelected(e.target.value)}>{club.roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role} · L{p.level}</option>)}</select></label></div>
 <div className="fhq-weight-growth">{[['Strength',player.stats.strength],['Speed',player.stats.speed],['IQ',player.stats.iq]].map(([name,value])=><div key={name}><small>{name}</small><strong>{value} <span>→ {Number(value)+1}</span></strong></div>)}</div>
 <p className="fhq-weight-impact">On the field: Grit {Math.round(growth.combat.statline.hp)} → <b>{Math.round(growth.nextStep.after.combat.statline.hp)}</b> · Yardage {Math.round(growth.combat.statline.dps)} → <b>{Math.round(growth.nextStep.after.combat.statline.dps)}</b></p>
 {blocked&&<p role="status" className="fhq-weight-notice">Waiting for club confirmation…</p>}
 {active?<button className="fhq-weight-primary" disabled={blocked||!ready} onClick={()=>onCollect(building)}>{ready?'Collect player growth':`Working out · ${remaining}s`} · +{Math.round(active.rewardCoins*trainingYieldMult(building.level))} Coins</button>:<div className="fhq-weight-workouts">{effects.map(effect=><button key={effect.drillId} disabled={blocked||!effect.canStart} onClick={()=>{setCelebrate(null);onStart(player.unit,effect.drillId)}}><strong>{WORKOUTS[effect.drillId]??effect.name}</strong><span>{effect.durationSeconds}s · {effect.energyCost} Energy · +{effect.coins} Coins</span><small>{effect.playersAffected} teammates grow · +{effect.readinessGain} readiness{!effect.unlocked?` · Room L${effect.levelReq} unlock` : !effect.canStart?' · '+(effect.blockers[0]?.message.replace(/Training Field/g,'Weight Room')??'Unavailable'):''}</small></button>)}</div>}
 <section className="fhq-weight-upgrade"><h3>Build a better room</h3><p>Level {building.level+1}: workout Coins {Math.round(trainingYieldMult(building.level)*100)}% → {Math.round(trainingYieldMult(building.level+1)*100)}% of base payout.</p><button disabled={upgradeBlocked} onClick={()=>onUpgrade(building.id,cost)}>{job?`Upgrading to L${job.toLevel}`:building.level>=stadium?`Requires Stadium L${building.level+1}`:`Upgrade room · ${cost.toLocaleString()} Coins`}</button><small>L2 bench · L3 turf · L4 team banner · L5 team circuit</small><small>{upgradeDurationSecs(building.level+1)}s build · {club.builders-club.upgrades.length} builders available</small></section>

 </section></div></Sheet>
}
