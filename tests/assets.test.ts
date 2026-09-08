import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuildingType, UnitGroup } from '../types';
import { buildingSprite, unitSprite, unitPlayerSprite, defenseSprite, wallSprite } from '../assets';
import { RANKS } from '../ranks';

describe('shipped game art', () => {
  it('provides every facility, defense, roster state and rank used by the resolvers', () => {
    const paths = new Set(RANKS.map(rank => rank.art));
    for (let level = 1; level <= 12; level++) {
      for (const building of Object.values(BuildingType)) paths.add(buildingSprite(building, level));
      for (const defense of ['jugs', 'sled', 'ref', 'tshirt', 'cooler']) paths.add(defenseSprite(defense, level));
      paths.add(wallSprite(level));
    }
    for (const group of Object.values(UnitGroup)) {
      for (const state of ['idle', 'ready', 'training'] as const) paths.add(unitSprite(group, state));
      paths.add(unitPlayerSprite(group));
    }
    expect([...paths].filter(path => !existsSync(resolve('public', path.slice(1))))).toEqual([]);
  });
  it('ships all literal image references in production source', () => {
    const files = [...readdirSync('.').filter(f => /\.(tsx?|html)$/.test(f)), ...readdirSync('components').filter(f => f.endsWith('.tsx')).map(f => `components/${f}`)];
    const missing: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/["'`]((?:\/assets\/)[^"'`$]+\.(?:png|webp|svg|jpg))["'`]/g)) {
        if (!existsSync(resolve('public', match[1].slice(1)))) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
