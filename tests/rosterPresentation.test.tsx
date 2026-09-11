import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SquadModal} from '../components/SquadModal';
import {createInitialState} from '../game/initialState';
import {unitPower} from '../battle';

describe('roster presentation',()=>{
 it('shows practice identities, differentiated Power and direct attribute training routes without expansion',()=>{
  const club=createInitialState();const html=renderToStaticMarkup(<SquadModal club={club} roster={club.roster} blocked={false} playerFilter={null} onFilterChange={()=>{}} onClose={()=>{}} onOpenWeightRoom={()=>{}} onOpenFacility={()=>{}} onScout={()=>{}}/>);
  for(const p of club.roster){expect(html).toContain(`${p.name} in club practice kit`);expect(html).toContain(`Train ${p.name}`);expect(html).toContain(`<strong>${Math.round(unitPower(p))}</strong>`);}
  for(const p of club.roster){
   expect(html).toContain(`aria-label="Train ${p.name} Strength in Weight Room"`);
   expect(html).toContain(`aria-label="Train ${p.name} Speed at Practice Field"`);
   expect(html).toContain(`aria-label="Train ${p.name} IQ in Film Room"`);
   for(const value of Object.values(p.stats))expect(html).toContain(`<strong>${value}<small> / ${p.maxStat}</small></strong>`);
  }expect(html).not.toContain('OVR');expect(html).not.toContain('-player.webp');expect(html).not.toContain('aria-expanded');
  for(const label of ['Weight Room','Recovery','Film Room','Scout a player'])expect(html).toContain(label);
 });
});
