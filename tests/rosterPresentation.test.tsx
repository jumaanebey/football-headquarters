import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SquadModal} from '../components/SquadModal';
import {createInitialState} from '../game/initialState';
import {unitPower} from '../battle';

describe('roster presentation',()=>{
 it('shows practice identities, differentiated Power and every next-level stat without expansion',()=>{
  const club=createInitialState();const html=renderToStaticMarkup(<SquadModal club={club} roster={club.roster} blocked={false} playerFilter={null} onFilterChange={()=>{}} onClose={()=>{}} onOpenWeightRoom={()=>{}} onOpenFacility={()=>{}} onScout={()=>{}}/>);
  for(const p of club.roster){expect(html).toContain(`${p.name} in club practice kit`);expect(html).toContain(`Train ${p.name}`);expect(html).toContain(`<strong>${Math.round(unitPower(p))}</strong>`);}
  expect((html.match(/<dl /g)??[])).toHaveLength(club.roster.length);expect(html).not.toContain('OVR');expect(html).not.toContain('-player.webp');expect(html).not.toContain('aria-expanded');
  for(const label of ['Weight Room','Recovery','Film Room','Scouting'])expect(html).toContain(label);
 });
});
