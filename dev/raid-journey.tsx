import coachedFilm from '../tests/fixtures/coached-fortress.json';
import type { ReplayAction } from '../battle';
import type { BattleConfig } from '../game/combat/contracts';
import { INITIAL_ROSTER } from '../constants';
import { armyFromRoster, generateRaidTargets, mulberry32, heroesForBattle, HERO_DEFS } from '../battle';
import { RoadTargetCard } from '../components/RoadTargetCard';
import {openCampusArt} from '../game/artGate';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BattleDebrief} from '../components/BattleDebrief';
import {MatchPreparation} from '../components/MatchPreparation';
import {BattleScreen} from '../components/BattleScreen';
import {heroPracticeConfig} from '../game/combat/practice';
import type {GamePlanKey} from '../battle';
import '../tailwind.css';import '../game-theme.css';import '../game-motion.css';import '../connected-campus.css';
function Fixture(){
 const params=new URLSearchParams(location.search),celebration=params.has('celebration');
 const [roadChoice,setRoadChoice]=useState<number|null>(null);
 const [playing,setPlaying]=useState(celebration),[collected,setCollected]=useState(false);
 const [plan,setPlan]=useState<GamePlanKey>('balanced'),[hero,setHero]=useState('qb');
 if(params.has('film'))return <BattleScreen config={{...coachedFilm.snapshot as BattleConfig,replay:{seed:coachedFilm.seed,script:coachedFilm.script as ReplayAction[],planKey:coachedFilm.plan,version:2,rules:coachedFilm.rules,expectedHash:coachedFilm.finalHash,expectedTicks:coachedFilm.ticks}}} clubName="Isolated QA" onFinish={()=>{}} onExit={()=>{}}/>;
 const base=heroPracticeConfig('qb');
 if(params.has('tactics')) {
   base.heroes=heroesForBattle(HERO_DEFS.slice(0,5).map(h=>({key:h.key,unlocked:true,level:1,stars:1})));
   base.title='Raid tactics · Isolated practice';base.squad=structuredClone(INITIAL_ROSTER);base.playerArmy=armyFromRoster(base.squad);
   base.buildings=[
     {id:'stadium',kind:'hq',x:57,y:40,size:15,hp:1800},
     {id:'jugs',kind:'defense',flavor:'jugs',x:28,y:50,size:7,hp:650,damage:8,range:21},
     {id:'water',kind:'defense',flavor:'cooler',x:60,y:70,size:7,hp:600,damage:0,range:21},
     {id:'cannon',kind:'defense',flavor:'tshirt',x:75,y:45,size:7,hp:650,damage:9,range:23},
     {id:'facility',kind:'building',x:35,y:72,size:10,hp:800},
     ...Array.from({length:5},(_,i)=>({id:`wall-${i}`,kind:'wall' as const,x:41,y:34+i*7,size:6,hp:280})),
   ];
 }

 if(params.has('roads')) {
   const targets=generateRaidTargets(1800,mulberry32(304443741));
   if(roadChoice===null)return <main className="mx-auto max-w-2xl space-y-3 p-4"><h1 className="text-xl font-bold">Road teams · isolated high-tier preview</h1><p className="text-sm text-slate-300">No account or resource changes. Choose a raid to inspect and play.</p>{targets.map((target,i)=><RoadTargetCard key={target.id} base={target} choice={i} onChoose={()=>setRoadChoice(i)}/>)}</main>;
   const target=targets[roadChoice];base.title=`Attacking ${target.name}`;base.buildings=target.buildings;base.roadChallenge=target.challenge;base.loot=target.reward;
   base.squad=Array.from({length:18},(_,i)=>({...structuredClone(INITIAL_ROSTER[i%INITIAL_ROSTER.length]),id:`preview-${i}`,stats:{strength:42,speed:42,iq:42}}));base.playerArmy=armyFromRoster(base.squad);
   base.heroes=heroesForBattle(HERO_DEFS.map(h=>({key:h.key,unlocked:true,level:15,stars:5})));
 }
 const rewardContext={claimedCampaignStages:[],gauntletBest:0,trophies:20};
 // Real combat/presentation with an easy target. This fixture has no App, save or transport.
 const config=celebration?{...base,practice:false,title:'Isolated reward journey',loot:{coins:693,fans:21},campaignStage:3,buildings:[{id:'fixture-hq',kind:'hq' as const,x:20,y:50,size:14,hp:1}]}:base;
 if(collected)return <p role="status">Rewards collected explicitly</p>;
 if(params.has('result'))return <BattleDebrief config={{...config,practice:false}} rewardContext={rewardContext} result={{mode:'attack',title:'Review result',stars:0,pct:32,coins:75,fans:0,won:false}} actors={[]} stats={{lost:3,pancakes:0,bonus:0}} modernCombat replayVerified={false} onContinue={()=>setCollected(true)}/>;
 return playing?<BattleScreen config={config} rewardContext={rewardContext} clubName="Journey Preview FC" initialPlan={plan} openingHero={hero} onFinish={()=>{setPlaying(false);setCollected(true)}} onExit={()=>setPlaying(false)}/>
 :<MatchPreparation config={config} energy={100} cost={0} plan={plan} openingHero={hero} onHero={setHero} onPlan={setPlan} onStart={()=>setPlaying(true)} onClose={()=>setRoadChoice(null)}/>;
}
if(import.meta.env.DEV){openCampusArt();createRoot(document.getElementById('root')!).render(<Fixture/>);}
