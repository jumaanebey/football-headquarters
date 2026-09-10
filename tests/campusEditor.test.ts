import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { campusItems, moveCampusItem } from '../game/campusEditor';
import { applyCampusLayout, campusLayoutForState, validateCampusLayout } from '../game/campusLayout';
import { createDefenseSnapshot } from '../game/defenseSnapshot';

describe('campus edits reach the saved defense', () => {
  it('moves a facility without mutating the saved draft or changing ownership', () => {
    const state = createInitialState(1), initial = campusLayoutForState(state);
    const scout = campusItems(initial).find(p => p.name === 'Scouting Dept')!;
    const moved = moveCampusItem(initial, scout.key, 7, 2);
    expect(initial.facilities.find(p => `facility:${p.id}` === scout.key)?.gridY).toBe(1);
    expect(validateCampusLayout(moved, state.buildings).valid).toBe(true);
    const saved = applyCampusLayout(state, moved);
    const reloaded = JSON.parse(JSON.stringify(saved));
    expect(createDefenseSnapshot(reloaded).campus).toEqual(campusLayoutForState(saved));
    expect(createDefenseSnapshot(reloaded).layoutId).not.toBe(createDefenseSnapshot(state).layoutId);
    expect(reloaded.resources).toEqual(state.resources);
  });
  it('rejects overlap and out-of-bounds drafts before saving', () => {
    const state = createInitialState(1), layout = campusLayoutForState(state);
    const scout = campusItems(layout).find(p => p.name === 'Scouting Dept')!;
    for (const [x,y] of [[4,4],[9,9],[0,0]]) {
      const invalid = moveCampusItem(layout, scout.key, x, y);
      expect(validateCampusLayout(invalid, state.buildings).valid).toBe(false);
      expect(() => applyCampusLayout(state, invalid)).toThrow();
    }
  });
  it('preserves slot, gate and wall identity through precise moves', () => {
    const layout = campusLayoutForState(createInitialState(1));
    for (const item of campusItems(layout)) {
      const changed = moveCampusItem(layout, item.key, 2, 3);
      expect(campusItems(changed).map(p=>p.key)).toEqual(campusItems(layout).map(p=>p.key));
      expect(campusItems(changed).find(p=>p.key===item.key)).toMatchObject({gridX:2,gridY:3});
    }
  });
});
