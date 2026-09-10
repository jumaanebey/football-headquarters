import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const emit = vi.hoisted(() => vi.fn());
vi.mock('../analytics', () => ({track: emit}));
vi.mock('../pvp', () => ({playerId: () => 'account-a'}));
import { productFunnel, observeVisit, observeGrowth } from '../game/productFunnel';
let data: Map<string,string>;
beforeEach(() => { data = new Map(); emit.mockClear(); vi.stubGlobal('localStorage', {getItem:(k:string)=>data.get(k) ?? null,setItem:(k:string,v:string)=>data.set(k,v)}); });
afterEach(() => {vi.unstubAllGlobals();vi.useRealTimers();});
it('deduplicates within a club but keeps account switches independent without sending identity', () => {
  productFunnel('first_kickoff',{mode:'attack'},'account-a');
  productFunnel('first_kickoff',{mode:'attack'},'account-a');
  productFunnel('first_kickoff',{mode:'attack'},'account-b');
  expect(emit).toHaveBeenCalledTimes(2);
  expect(emit.mock.calls.every(call => JSON.stringify(call) === '["funnel_first_kickoff",{"mode":"attack"}]')).toBe(true);
});
it('counts next-day return once and never calls the first observation a return', () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  observeVisit('account-a',false,true,'direct');
  expect(emit.mock.calls.map(c=>c[0])).toEqual(['funnel_visible_start']);
  vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
  observeVisit('account-a',false,true,'direct'); observeVisit('account-a',false,true,'direct');
  expect(emit.mock.calls.map(c=>c[0])).toEqual(['funnel_visible_start','funnel_return_visit']);
});
it('does not break a game when storage access fails', () => {
  vi.stubGlobal('localStorage',{getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}});
  expect(() => productFunnel('first_kickoff',{mode:'attack'})).not.toThrow();
});

it('observes completed growth across reloads without counting the initial club or another account', () => {
  observeGrowth('account-a', {stadium: 2, enforcer: 1}, true);
  expect(emit).not.toHaveBeenCalled();
  observeGrowth('account-b', {stadium: 9, enforcer: 9}, true);
  observeGrowth('account-a', {stadium: 2, enforcer: 2}, true);
  observeGrowth('account-a', {stadium: 2, enforcer: 2}, true);
  expect(emit).toHaveBeenCalledExactlyOnceWith('funnel_upgrade_meaningful', {kind:'hero', toLevel:2, protected:true});
});
