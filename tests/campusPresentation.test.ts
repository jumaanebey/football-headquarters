import {describe,it,expect} from 'vitest';
import {createInitialState} from '../game/initialState';
import {campusDisplayBuildings,campusFieldClear,campusBuildingWidth,ARRIVAL} from '../game/campusPresentation';
import {campusSilhouette} from '../game/campusSilhouette';
import {BuildingType} from '../types';

describe('main campus composition',()=>{
 it('keeps the central practice lawn free without changing stored buildings',()=>{
  const buildings=createInitialState(1).buildings;const saved=JSON.stringify(buildings);
  const display=campusDisplayBuildings(buildings,false);
  expect(campusFieldClear(display)).toBe(true);
  expect(JSON.stringify(buildings)).toBe(saved);
  expect(new Set(display.map(b=>`${b.gridX},${b.gridY}`)).size).toBe(5);
 });
 it('honors custom placement and scales art to fit competitive footprints',()=>{
  const buildings=createInitialState(1).buildings;
  expect(campusDisplayBuildings(buildings,true)).toEqual(buildings);
  expect(campusFieldClear([{...buildings[0],gridX:4,gridY:4}])).toBe(false);
  expect(campusBuildingWidth(BuildingType.STADIUM,true)).toBeLessThan(2*118);
 });
 it('uses a separated single row on short landscape screens',()=>{
  const saved=createInitialState(1).buildings;
  const row=campusDisplayBuildings(saved,false,true).sort((a,b)=>a.gridX-b.gridX);
  expect(new Set(row.map(b=>b.gridX+b.gridY)).size).toBe(1);
  for(let i=1;i<row.length;i++) expect((row[i].gridX-row[i].gridY-row[i-1].gridX+row[i-1].gridY)*59).toBeGreaterThan(300);
  expect(campusDisplayBuildings(saved,true,true)).toEqual(saved);
 });
 it('keeps the bus inside its arrival bay beyond the facility grid',()=>{
  expect(ARRIVAL.busX).toBeGreaterThan(ARRIVAL.x1);
  expect(ARRIVAL.busX).toBeLessThan(ARRIVAL.x2);
  expect(ARRIVAL.busY).toBeGreaterThan(ARRIVAL.y1);
  expect(ARRIVAL.busY).toBeLessThan(ARRIVAL.y2);
  expect(ARRIVAL.x1).toBeGreaterThan(10);
 });
 it('uses opaque pixels for click bounds, excluding transparent padding and faint shadow',()=>{
  const data=new Uint8ClampedArray(100*100*4);
  for(let y=20;y<80;y++)for(let x=25;x<75;x++)data[(y*100+x)*4+3]=255;
  data[3]=20;
  const shape=campusSilhouette(data,100,100)!;
  expect(shape).toMatchObject({left:.25,right:.75,top:.2,bottom:.8});
  expect(shape.clipPath).not.toContain('0.00% 0.00%');
  expect(campusSilhouette(new Uint8ClampedArray(400),10,10)).toBeNull();
 });
});
