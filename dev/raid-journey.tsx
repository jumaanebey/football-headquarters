import {openCampusArt} from '../game/artGate';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BattleDebrief} from '../components/BattleDebrief';
import {MatchPreparation} from '../components/MatchPreparation';
import {BattleScreen} from '../components/BattleScreen';
import {heroPracticeConfig} from '../game/combat/practice';
import type {GamePlanKey} from '../battle';
import '../tailwind.css';import '../game-theme.css';import '../game-motion.css';
function Fixture(){
 const params=new URLSearchParams(location.search),celebration=params.has('celebration');
 const [playing,setPlaying]=useState(celebration),[collected,setCollected]=useState(false);
 const [plan,setPlan]=useState<GamePlanKey>('balanced'),[hero,setHero]=useState('qb');
 const base=heroPracticeConfig('qb');
 const rewardContext={claimedCampaignStages:[],gauntletBest:0,trophies:20};
 // Real combat/presentation with an easy target. This fixture has no App, save or transport.
 const config=celebration?{...base,practice:false,title:'Isolated reward journey',loot:{coins:693,fans:21},campaignStage:3,buildings:[{id:'fixture-hq',kind:'hq' as const,x:20,y:50,size:14,hp:1}]}:base;
 if(collected)return <p role="status">Rewards collected explicitly</p>;
 if(params.has('result'))return <BattleDebrief config={{...config,practice:false}} rewardContext={rewardContext} result={{mode:'attack',title:'Review result',stars:0,pct:32,coins:75,fans:0,won:false}} actors={[]} stats={{lost:3,pancakes:0,bonus:0}} modernCombat replayVerified={false} onContinue={()=>setCollected(true)}/>;
 return playing?<BattleScreen config={config} rewardContext={rewardContext} clubName="Journey Preview FC" initialPlan={plan} openingHero={hero} onFinish={()=>{setPlaying(false);setCollected(true)}} onExit={()=>setPlaying(false)}/>
 :<MatchPreparation config={config} energy={100} cost={0} plan={plan} openingHero={hero} onHero={setHero} onPlan={setPlan} onStart={()=>setPlaying(true)} onClose={()=>{}}/>;
}
if(import.meta.env.DEV){openCampusArt();createRoot(document.getElementById('root')!).render(<Fixture/>);}
