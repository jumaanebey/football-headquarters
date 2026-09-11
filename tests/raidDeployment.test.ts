import {it,expect} from 'vitest';
import {raidEntryLanes} from '../game/raidDeployment';
import {campaignBase,CAMPAIGN_STAGES} from '../campaign';
it('offers legal entry coordinates for every campaign layout',()=>{for(let stage=1;stage<=CAMPAIGN_STAGES.length;stage++){const buildings=campaignBase(stage).buildings,lanes=raidEntryLanes(buildings);expect(lanes.some(l=>l.point)).toBe(true);for(const lane of lanes)if(lane.point){const p=lane.point;expect(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100).toBe(true);expect(buildings.every(b=>Math.hypot(b.x-p.x,b.y-p.y)>=14)).toBe(true);}}});
it('moves a blocked center entry along the same sideline, and never selects a building',()=>{const buildings=[{x:4,y:50,dead:false}],lane=raidEntryLanes(buildings)[0];expect(lane.point).toEqual({x:4,y:30});expect(raidEntryLanes([{x:4,y:50,dead:true}])[0].point).toEqual({x:4,y:50});});
