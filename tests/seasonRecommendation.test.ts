import { describe, expect, it } from 'vitest';
import { nextSeasonMatch } from '../game/seasonRecommendation';
import { CAMPAIGN_STAGES } from '../campaign';

describe('season recommendations', () => {
  it('prioritizes an unclaimed first clear without sending a new club to a locked stage', () => {
    expect(nextSeasonMatch({unlocked: 1, stars: {}, claimed: []}).stage.stage).toBe(1);
    expect(nextSeasonMatch({unlocked: 4, stars: {1:3,2:1,3:3}, claimed:[1,2,3]}).stage.stage).toBe(4);
  });
  it('finds missed balls after every first clear has been collected', () => {
    const claimed = CAMPAIGN_STAGES.map(s=>s.stage);
    const stars = Object.fromEntries(claimed.map(s=>[s,3])); stars[2]=1;
    const result=nextSeasonMatch({unlocked:12,claimed,stars});
    expect(result.stage.stage).toBe(2);
    expect(result.detail).toContain('already collected');
  });
  it('celebrates completion and offers the final when every stage has three balls', () => {
    const claimed=CAMPAIGN_STAGES.map(s=>s.stage);
    const result=nextSeasonMatch({unlocked:99,claimed,stars:Object.fromEntries(claimed.map(s=>[s,3]))});
    expect(result.label).toBe('Season complete');
    expect(result.stage.stage).toBe(CAMPAIGN_STAGES.length);
  });
});
