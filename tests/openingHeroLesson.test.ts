import { describe, expect, it } from 'vitest';
import { firstMatchLesson } from '../game/firstMatchLesson';

describe('chosen opening hero lesson', () => {
  const hero = { name: 'The Enforcer', abilityName: 'Truck Stick' };
  it('teaches the chosen hero instead of always asking for the quarterback', () => {
    expect(firstMatchLesson(false, false, false, hero).title).toBe('Send in The Enforcer');
    expect(firstMatchLesson(true, false, false, hero).title).toBe('Call Truck Stick');
    expect(firstMatchLesson(true, true, false, hero).step).toBe(3);
  });
  it('offers practice if the chosen hero leaves before calling the signature', () => {
    expect(firstMatchLesson(true, false, true, hero).title).toContain('practice');
    expect(firstMatchLesson(true, false, true, hero).step).toBe(2);
  });
});
