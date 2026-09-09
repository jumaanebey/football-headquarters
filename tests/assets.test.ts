import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuildingType, UnitGroup } from '../types';
import { buildingSprite, unitSprite, unitPlayerSprite, defenseSprite, wallSprite } from '../assets';
import { RANKS } from '../ranks';
import { MODERN_HEROES } from '../game/heroAnimation';
import { HERO_ATLAS } from '../game/heroAtlas';
import { HERO_DEFS } from '../battle';
import { WALK_FRAMES } from '../components/SpriteFrames';
import { GROUND_ART } from '../game/groundArt';

describe('shipped game art', () => {
  it('ships floorless scenery with valid, isolated atlas regions', () => {
    for (const [original, art] of Object.entries(GROUND_ART)) {
      expect(existsSync(resolve('public', original.slice(1))), original).toBe(true);
      expect(existsSync(resolve('public', art.src.slice(1))), art.src).toBe(true);
      const [x, y, w, h] = art.region ?? [0, 0, 1, 1];
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(1); expect(y + h).toBeLessThanOrEqual(1);
    }
    // A new construction era must not silently bring the old grass apron back.
    for (const type of Object.values(BuildingType)) {
      for (let level = 3; level <= 12; level++) {
        expect(GROUND_ART[buildingSprite(type, level)]).toBeDefined();
      }
    }
  });
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
  it('ships complete walk cycles and action poses for every hero and player group', () => {
    const paths: string[] = [];
    for (const hero of HERO_DEFS) {
      paths.push(hero.art);
      for (const frame of WALK_FRAMES) paths.push(`/assets/heroes/rig/${hero.key}-${frame}.webp`);
      paths.push(hero.key === 'qb' ? '/assets/heroes/franchise-rig/body-followthrough.webp' : `/assets/heroes/rig/${hero.key}-action.webp`);
      for (const frame of ['idleA', 'idleB']) paths.push(`/assets/heroes/rig/${hero.key}-${frame}.webp`);
    }
    for (const group of Object.values(UnitGroup)) {
      const base = unitPlayerSprite(group).replace('-player.webp', '');
      for (const frame of WALK_FRAMES) paths.push(`${base}-${frame}.webp`);
    }
    expect(paths.filter(path => !existsSync(resolve('public', path.slice(1))))).toEqual([]);
  });
  it('ships nine-pose production sheets for the complete hero roster', () => {
    expect([...MODERN_HEROES].sort()).toEqual(HERO_DEFS.map(h => h.key).sort());
    for (const key of MODERN_HEROES) {
      const webp = readFileSync(`public/assets/heroes/elite/${key}.webp`);
      expect(webp.subarray(0,4).toString()).toBe('RIFF');
      expect(webp.subarray(8,12).toString()).toBe('WEBP');
      expect(HERO_ATLAS[key]).toHaveLength(9);
      for (const [x, y, right, bottom] of HERO_ATLAS[key]) {
        expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
        expect(right).toBeGreaterThan(x); expect(bottom).toBeGreaterThan(y);
        expect(right).toBeLessThanOrEqual(1254); expect(bottom).toBeLessThanOrEqual(1254);
      }
    }
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
