import { describe, expect, it } from 'vitest';
import { buildingObscuresHero, moveBattleCursor, visibleBattleEffects, heroKeyForPresentation } from '../game/battleReadability';
describe('battle readability', () => {
  it('recognizes defending heroes for occlusion and substitutions',()=>{expect(heroKeyForPresentation({guardArt:'/assets/heroes/burner.webp'})).toBe('burner');expect(heroKeyForPresentation({guardArt:'/assets/units/mascot.webp'})).toBeUndefined();});
  const building={x:50,y:50,width:20,depth:50};
  it('fades a building only for an overlapping hero behind it',()=>{
    expect(buildingObscuresHero(building,[{x:50,y:45,depth:40}])).toBe(true);
    for(const hero of [{x:50,y:45,depth:60},{x:20,y:45,depth:40},{x:50,y:20,depth:40}]) expect(buildingObscuresHero(building,[hero])).toBe(false);
  });
  it('bounds clutter while retaining score feedback under reduced motion',()=>{
    const effects=[{type:'yards'},...Array.from({length:100},()=>({type:'dust'})),{type:'dmg'}];
    expect(visibleBattleEffects(effects,false)).toHaveLength(21);
    expect(visibleBattleEffects(effects,true).map(f=>f.type)).toEqual(['dmg','yards']);
  });
  it('moves keyboard aim in projected screen directions and clamps at field edges',()=>{
    expect(moveBattleCursor({x:50,y:50},'ArrowLeft')).toEqual({x:45,y:55});
    expect(moveBattleCursor({x:0,y:100},'ArrowLeft')).toEqual({x:0,y:100});
  });
});
