import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {LineupBoard} from '../components/LineupBoard';
import {createInitialState} from '../game/initialState';
import {applyClubAction} from '../game/authority/clubActions';
describe('starting lineup presentation',()=>{
 it('shows nine named starting slots, reserve identity and readable ratings',()=>{
  const html=renderToStaticMarkup(<LineupBoard club={createInitialState()} blocked={false} onAction={()=>{}}/>);
  expect((html.match(/<select /g)??[]).length).toBe(9);
  expect(html).toContain('Tank in reserve');expect(html).toContain('38');expect(html).toContain('12.9');expect(html).not.toContain('12.933333333333');
  expect(html).toContain('Quarterback starter');expect(html).toContain('Safety starter');
 });
 it('locks choices during a Stadium possession with a reason',()=>{
  const started=applyClubAction(createInitialState(),{type:'stadium.start',opponent:'harbor'},{now:Date.now(),random:()=>.4});expect(started.ok).toBe(true);
  const html=renderToStaticMarkup(<LineupBoard club={started.state} blocked={false} onAction={()=>{}}/>);
  expect((html.match(/<fieldset disabled/g)??[]).length).toBe(2);expect(html).toContain('Lineup locked until the final whistle.');
 });
 it('locks editing while an authority answer is pending',()=>{
  const html=renderToStaticMarkup(<LineupBoard club={createInitialState()} blocked onAction={()=>{}}/>);
  expect((html.match(/<fieldset disabled/g)??[]).length).toBe(2);expect(html).toContain('Waiting for club confirmation');
 });
});
