import {CAMPAIGN_STAGES} from '../campaign';
import {HERO_DEFS} from '../battle';
import {trophiesForRaid} from '../ranks';
import type {BattleResult} from './combat/contracts';
export type RewardContext={claimedCampaignStages:readonly number[];gauntletBest:number;trophies:number};
/** Presentation only; settlement remains the responsibility of the club authority. */
export function extraBattleRewards(result:BattleResult,context?:RewardContext){
 const rows:Array<{label:string;amount:number}>=[];
 if(result.isPractice||result.isReplay)return rows;
 if(result.mode==='attack'){
  const stage=result.campaignStage?CAMPAIGN_STAGES.find(s=>s.stage===result.campaignStage):undefined;
  if(stage){
   if(context&&result.won&&!context.claimedCampaignStages.includes(stage.stage)){
    rows.push({label:'First-clear Crowns',amount:stage.firstClear.gems});
    rows.push({label:`${HERO_DEFS.find(h=>h.key===stage.firstClear.shardHero)?.name??'Hero'} shards`,amount:stage.firstClear.shards});
   }
  }else{
   rows.push({label:'Crowns',amount:result.stars>=3?5:result.stars===2?2:result.stars===1?1:0});
   const delta=trophiesForRaid(result.won,result.stars);
   rows.push({label:'Trophies',amount:(context?Math.max(-context.trophies,delta):delta)+0});
  }
 }else if(context&&result.gauntletCleared&&result.gauntletTier!==undefined&&result.gauntletTier>context.gauntletBest){
  rows.push({label:'First-clear Crowns',amount:5});
 }
 return rows;
}
