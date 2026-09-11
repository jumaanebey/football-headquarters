import {openCampusArt} from '../game/artGate';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BattleDebrief} from '../components/BattleDebrief';
import {MatchPreparation} from '../components/MatchPreparation';
import {BattleScreen} from '../components/BattleScreen';
import {heroPracticeConfig} from '../game/combat/practice';
import type {GamePlanKey} from '../battle';
import '../tailwind.css';import '../game-theme.css';import '../game-motion.css';
function Fixture(){const[playing,setPlaying]=useState(false);const[plan,setPlan]=useState<GamePlanKey>('balanced');const[hero,setHero]=useState('qb');const config=heroPracticeConfig('qb');if(new URLSearchParams(location.search).has('result'))return <BattleDebrief config={{...config,practice:false}} result={{mode:'attack',title:'Review result',stars:0,pct:32,coins:75,fans:0,won:false}} actors={[]} stats={{lost:3,pancakes:0,bonus:0}} modernCombat={true} replayVerified={false} onContinue={()=>{}}/>;return playing?<BattleScreen config={config} clubName="Journey Preview FC" initialPlan={plan} openingHero={hero} onFinish={()=>setPlaying(false)} onExit={()=>setPlaying(false)}/>:<MatchPreparation config={config} energy={100} cost={0} plan={plan} openingHero={hero} onHero={setHero} onPlan={setPlan} onStart={()=>setPlaying(true)} onClose={()=>{}}/>}
if(import.meta.env.DEV){openCampusArt();createRoot(document.getElementById('root')!).render(<Fixture/>);}
