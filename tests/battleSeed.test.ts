import { describe, expect, it, vi } from 'vitest';
import { battleSeed } from '../game/battleSeed';
import type { BattleConfig } from '../game/combat/contracts';

const base: BattleConfig = {mode:'attack',title:'Seed test',buildings:[],loot:{coins:0,fans:0}};
describe('battle randomness ownership', () => {
  it('uses the server seed including zero without consulting local randomness', () => {
    const random=vi.fn(()=>42);
    expect(battleSeed({...base,authority:{matchId:'test',seed:0,rules:'v2',issuedAt:0,expiresAt:1}},random)).toBe(0);
    expect(random).not.toHaveBeenCalled();
  });
  it('uses the recorded seed for replay', () => {
    expect(battleSeed({...base,replay:{seed:17,planKey:'air',script:[]}},()=>42)).toBe(17);
  });
  it('generates a seed for local play', () => {
    expect(battleSeed(base,()=>42)).toBe(42);
  });
});
