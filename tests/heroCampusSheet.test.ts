// Derived campus sheets: the layout the renderer expects, present for every modern hero, with
// alpha, at a fraction of the authored sheets' size.
import { describe, expect, it } from 'vitest';
import { statSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { MODERN_HEROES } from '../game/heroAnimation';
import { heroMotionColumns } from '../game/heroMotion';
import { CAMPUS_FRAME, campusFrameCount, campusFrameMap, campusSheetPath } from '../game/heroCampusSheet';

describe('campus hero sheets', () => {
  it('map the nine poses and both facings of idle plus four stride frames', () => {
    for (const key of MODERN_HEROES) {
      const map = campusFrameMap(key), columns = heroMotionColumns(key);
      expect(map.elite).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(Object.keys(map.motion).map(Number).sort((a, b) => a - b)).toEqual([0, 2, 3, 4, 5, columns, columns + 2, columns + 3, columns + 4, columns + 5]);
      expect(new Set(Object.values(map.motion)).size).toBe(10);
      expect(campusFrameCount(key)).toBe(19);
    }
  });
  it('ship for every modern hero with the expected dimensions, alpha, and under a tenth of the authored sheets', async () => {
    for (const key of MODERN_HEROES) {
      const path = `public${campusSheetPath(key)}`;
      const meta = await sharp(readFileSync(path)).metadata();
      expect([meta.width, meta.height, meta.hasAlpha], key).toEqual([CAMPUS_FRAME * campusFrameCount(key), CAMPUS_FRAME, true]);
      const authored = statSync(`public/assets/heroes/elite/${key}.webp`).size + statSync(`public/assets/heroes/motion/${key}.webp`).size;
      expect(statSync(path).size, key).toBeLessThan(authored / 10);
      expect(statSync(path).size, key).toBeLessThan(300 * 1024);
    }
  });
});
