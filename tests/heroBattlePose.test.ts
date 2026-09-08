import { expect, it } from 'vitest';
import { heroBattlePose } from '../game/heroBattlePose';
it('plays contact on the release beat, then recovers or resumes running', () => {
  expect(heroBattlePose({ actionPoseT: .28 }, true)).toBe('attack');
  expect(heroBattlePose({ actionPoseT: 0 }, true)).toBe('idle');
  expect(heroBattlePose({ actionPoseT: 0, moving: true }, true)).toBe('walk');
});
it('shows the ability beat even while moving, and recovers before cooldown ends', () => {
  expect(heroBattlePose({ abilityPoseT: .8, moving: true }, true)).toBe('attack');
  expect(heroBattlePose({ abilityPoseT: .3, moving: true }, true)).toBe('walk');
});
it('stops every pose on the result screen, including an unfinished ability', () => {
  expect(heroBattlePose({ actionPoseT: .28, abilityPoseT: .8, moving: true }, false)).toBe('idle');
});
