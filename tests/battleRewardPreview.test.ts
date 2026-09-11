import {describe,it,expect} from 'vitest';
import {extraBattleRewards} from '../game/battleRewardPreview';
import {settleMatchRewards} from '../game/authority/matches';
import {createInitialState} from '../game/initialState';
import type {BattleResult} from '../game/combat/contracts';
const result:BattleResult={mode:'attack',title:'Preview',stars:2,pct:61,coins:693,fans:21,won:true};
describe('reward presentation agrees with actual settlement',()=>{
 it.each(['raid','first-clear','repeat-clear','loss','gauntlet','repeat-gauntlet'] as const)('%s',kind=>{
  const state=createInitialState();state.trophies=0;
  const outcome={...result};
  if(kind.includes('clear'))outcome.campaignStage=3;
  if(kind==='repeat-clear')state.campaign.claimed=[3];
  if(kind==='loss'){outcome.stars=0;outcome.won=false;}
  if(kind.includes('gauntlet')){outcome.mode='defense';outcome.gauntletTier=1;outcome.gauntletCleared=true;outcome.wavesHeld=5;if(kind==='repeat-gauntlet')state.gauntlet.best=1;}
  const rows=extraBattleRewards(outcome,{claimedCampaignStages:state.campaign.claimed,gauntletBest:state.gauntlet.best,trophies:state.trophies});
  const settled=settleMatchRewards(state,outcome,Date.now());
  expect(rows.filter(r=>r.label.includes('Crowns')).reduce((n,r)=>n+r.amount,0)).toBe(settled.resources.GEMS-state.resources.GEMS);
  expect(rows.find(r=>r.label==='Trophies')?.amount??0).toBe(settled.trophies-state.trophies);
  expect(rows.filter(r=>r.label.endsWith('shards')).reduce((n,r)=>n+r.amount,0)).toBe(settled.heroes.reduce((n,h)=>n+h.shards,0)-state.heroes.reduce((n,h)=>n+h.shards,0));
 });
 it('shows no progression rewards for practice or replay',()=>{
  expect(extraBattleRewards({...result,isPractice:true})).toEqual([]);
  expect(extraBattleRewards({...result,isReplay:true})).toEqual([]);
 });
});
