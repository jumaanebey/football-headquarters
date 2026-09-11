import {UnitGroup} from '../types';

export const indoorPlayerColumn:Record<UnitGroup,number>={
  [UnitGroup.OFFENSE_LINE]:0,[UnitGroup.OFFENSE_SKILL]:1,
  [UnitGroup.DEFENSE_LINE]:2,[UnitGroup.DEFENSE_SECONDARY]:3,
};
export const indoorGroupName:Record<UnitGroup,string>={
  [UnitGroup.OFFENSE_LINE]:'Offensive line',[UnitGroup.OFFENSE_SKILL]:'Skill positions',
  [UnitGroup.DEFENSE_LINE]:'Defensive front',[UnitGroup.DEFENSE_SECONDARY]:'Secondary',
};
/** The authored atlas uses a magenta production matte. Composite it at draw time,
 * including anti-aliased edges; warm skin, navy cloth and neutral equipment survive. */
export function keyIndoorMatte(pixels:Uint8ClampedArray){
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    const key=Math.max(0,Math.min(1,(Math.min(r,b)-g-20)/80));
    if(!key)continue;
    pixels[i+3]=Math.round(pixels[i+3]*(1-key));
    if(key<1){pixels[i]=Math.max(0,(r-255*key)/(1-key));pixels[i+2]=Math.max(0,(b-255*key)/(1-key));}
  }
}
