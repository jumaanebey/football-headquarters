import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect } from 'vitest';
import { DefenseShot } from '../components/DefenseShot';
const shot=(flavor:string,u=.5)=>renderToStaticMarkup(<DefenseShot flavor={flavor} u={u} sx={10} sy={20} tx={40} ty={50} rotation={0}/>);
describe('equipment effects',()=>{
  it('never shows a football for water or padded impacts',()=>{
    expect(shot('cooler')).toContain('water-spray');
    expect(shot('sled')).toContain('sled-impact');
    for(const flavor of ['cooler','sled','ref','tshirt']) expect(shot(flavor)).not.toContain('football-proj');
    expect(shot('jugs')).toContain('football-proj');
  });
  it('does not show staggered shots before release or after expiry',()=>{
    expect(shot('cooler',-.1)).toBe(''); expect(shot('jugs',1.1)).toBe('');
  });
});
