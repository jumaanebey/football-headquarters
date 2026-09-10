// Hero presentation profiles: nine distinct identities from the frames that exist, safe
// defaults for unknown keys, transitions that never teleport, timing tied to the caller's clock
// (simulation time in battle), reduced-motion behaviour, and no influence on simulation state.
import { describe, expect, it } from 'vitest';
import { HERO_PRESENTATION, DEFAULT_HERO_PRESENTATION, heroPresentation, strideColumn, attackPhase, reactionOffset } from '../game/heroPresentation';
import { advanceHeroMotion, heroMotionColumns, heroMotionRow } from '../game/heroMotion';
import { heroPatrol } from '../game/heroPatrol';
import { HERO_MOVEMENT_STYLE } from '../game/heroMovementStyle';
import { MODERN_HEROES } from '../game/heroAnimation';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';

const NINE = [...MODERN_HEROES];

describe('presentation profiles', () => {
  it('cover all nine heroes, differ pairwise on several dimensions, and only reference frames that exist', () => {
    expect(Object.keys(HERO_PRESENTATION).sort()).toEqual([...NINE].sort());
    const signature = (k: string) => { const p = HERO_PRESENTATION[k]; return [p.cadence, p.contactHold, p.idle.breathSeconds, p.start.seconds, p.turn.seconds, p.stop.seconds, p.attack.anticipationSeconds, p.attack.anticipationColumn, p.attack.recoverySeconds, p.reaction.intensity, p.signature.prepSeconds, !!p.gesture, p.campus.travel, p.campus.cycle]; };
    for (const a of NINE) for (const b of NINE) if (a < b) {
      const diff = signature(a).filter((v, i) => v !== signature(b)[i]).length;
      expect(diff, `${a} vs ${b}`).toBeGreaterThanOrEqual(3);
    }
    for (const k of NINE) {
      const p = HERO_PRESENTATION[k], columns = heroMotionColumns(k);
      for (const c of [p.idle.column, p.start.column, p.turn.column, p.stop.column, p.attack.anticipationColumn, p.attack.recoveryColumn, p.signature.prepColumn]) expect(c, k).toBeLessThan(columns);
      if (p.gesture) expect(HERO_MOTION_BOUNDS[k].length, k).toBeGreaterThanOrEqual(8); // column 7 exists on every sheet
    }
  });
  it('unknown and legacy keys get the base profile; the legacy movement style derives from the profiles', () => {
    expect(heroPresentation('rb')).toBe(DEFAULT_HERO_PRESENTATION);
    expect(heroPresentation(undefined)).toBe(DEFAULT_HERO_PRESENTATION);
    expect(heroPresentation('')).toBe(DEFAULT_HERO_PRESENTATION);
    expect(HERO_MOVEMENT_STYLE.burner).toEqual({ lift: HERO_PRESENTATION.burner.lift, breath: HERO_PRESENTATION.burner.idle.breathSeconds });
  });
  it('the named identities are expressed in the profile values', () => {
    const p = HERO_PRESENTATION;
    expect(p.enforcer.contactHold).toBeGreaterThan(p.burner.contactHold); // heavier footfalls
    expect(p.enforcer.attack.recoverySeconds).toBeGreaterThan(p.burner.attack.recoverySeconds); // distinct contact recovery
    expect(p.burner.cadence).toBeLessThan(p.legend.cadence); // quick cadence vs deliberate stride
    expect(p.burner.stop.seconds).toBeGreaterThan(p.playmaker.stop.seconds); // clear burst/stop
    expect(p.kicker.attack.anticipationSeconds).toBeGreaterThan(p.burner.attack.anticipationSeconds); // approach/plant/kick
    expect(p.coach.gesture && p.medic.gesture && p.playmaker.gesture).toBeTruthy(); // directive, treatment cue, decoy
    expect(p.qb.gesture ?? p.enforcer.gesture ?? p.captain.gesture).toBeUndefined();
    expect(p.captain.turn.seconds).toBeGreaterThan(p.playmaker.turn.seconds); // measured turns vs agile cuts
    expect(p.legend.signature.prepSeconds).toBeGreaterThan(0); // signature preparation
    expect(p.qb.attack.anticipationColumn).toBe(6); // planted read/throw posture
  });
});

describe('stride, attack phase and reaction helpers', () => {
  it('stride frames alternate contact and swing with the profile hold and stay inside columns 2–5', () => {
    for (const hold of [.4, .5, .66]) for (let i = 0; i < 40; i++) expect([2, 3, 4, 5]).toContain(strideColumn(i / 40, hold));
    expect(strideColumn(0, .66)).toBe(2); expect(strideColumn(.3, .66)).toBe(2); expect(strideColumn(.4, .66)).toBe(3); expect(strideColumn(.5, .66)).toBe(4);
    expect(strideColumn(.3, .4)).toBe(3); // light hero lifts off sooner
    expect(strideColumn(NaN, .5)).toBe(2); expect(strideColumn(-0.25, .5)).toBe(5);
  });
  it('attack phases come from the simulation countdown; reaction offsets are cosmetic, facing-aware and off under reduced motion', () => {
    const p = HERO_PRESENTATION.kicker; // anticipation .14, recovery .06 of a .28 window
    expect(attackPhase(p, .28, .28)).toBe('anticipation'); expect(attackPhase(p, .2, .28)).toBe('anticipation'); expect(attackPhase(p, .1, .28)).toBe('contact'); expect(attackPhase(p, .05, .28)).toBe('recovery');
    const light = reactionOffset(HERO_PRESENTATION.qb, .14, 1), heavy = reactionOffset(HERO_PRESENTATION.burner, .22, 1);
    expect(Math.abs(heavy.dx)).toBeGreaterThan(Math.abs(light.dx));
    expect(reactionOffset(HERO_PRESENTATION.burner, .22, -1).dx).toBe(-heavy.dx);
    expect(reactionOffset(HERO_PRESENTATION.burner, .22, 1, true)).toEqual({ dx: 0, dy: 0 });
    expect(reactionOffset(HERO_PRESENTATION.burner, 0, 1)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('battle motion frames', () => {
  const walk = (key: string, steps: number, dir: [number, number], clock: (i: number) => number) => {
    let state: ReturnType<typeof advanceHeroMotion>['state'] | undefined; const frames: number[] = []; let x = 10, y = 10, phase = 0;
    for (let i = 0; i < steps; i++) { x += dir[0]; y += dir[1]; phase = (phase + .07) % 1; const s = advanceHeroMotion(state, { x, y, moving: true, stridePhase: phase }, clock(i), key); state = s.state; frames.push(s.frame); }
    return { state, frames };
  };
  it('start → stride → turn → stop → idle without a teleport, using only columns the hero has', () => {
    for (const key of NINE) {
      const columns = heroMotionColumns(key), p = HERO_PRESENTATION[key];
      const { state, frames } = walk(key, 30, [-.4, 0], i => i * .05);
      expect(frames[0] % columns).toBe(p.start.column);
      expect(frames.slice(12).every(f => [2, 3, 4, 5].includes(f % columns)), key).toBe(true);
      const row = heroMotionRow(key, state!.direction);
      expect(frames.slice(12).every(f => Math.floor(f / columns) === row), key).toBe(true);
      // Turn: direction flips, the plant frame shows for the profile's turn window, then striding resumes on the new row.
      const turned = advanceHeroMotion(state, { x: state!.x + 1, y: state!.y, moving: true, stridePhase: .3 }, 1.5, key);
      expect(turned.state.transition).toBe('turn'); expect(turned.frame % columns).toBe(p.turn.column);
      const later = advanceHeroMotion(turned.state, { x: turned.state.x + .4, y: turned.state.y, moving: true, stridePhase: .35 }, 1.5 + p.turn.seconds + .01, key);
      expect([2, 3, 4, 5]).toContain(later.frame % columns);
      // Stop: settle on the stop column, then idle; facing stays (no teleport to another row).
      const stopped = advanceHeroMotion(later.state, { x: later.state.x, y: later.state.y, moving: false, stridePhase: .35 }, 2, key);
      expect(stopped.frame % columns).toBe(p.stop.column);
      const idle = advanceHeroMotion(stopped.state, { x: later.state.x, y: later.state.y, moving: false }, 2 + p.stop.seconds + .01, key);
      expect(idle.frame % columns).toBe(p.idle.column);
      expect(Math.floor(idle.frame / columns)).toBe(Math.floor(later.frame / columns));
    }
  });
  it('transition timing follows the caller\'s clock: a paused simulation clock holds the transition frame', () => {
    const key = 'legend', p = HERO_PRESENTATION.legend, columns = heroMotionColumns(key);
    let s = advanceHeroMotion(undefined, { x: 0, y: 0, moving: true, stridePhase: 0 }, 0, key);
    expect(s.frame % columns).toBe(p.start.column);
    for (let i = 0; i < 5; i++) s = advanceHeroMotion(s.state, { x: -.4 * (i + 1), y: 0, moving: true, stridePhase: 0 }, 0, key); // clock does not advance (paused)
    expect(s.frame % columns).toBe(p.start.column);
    s = advanceHeroMotion(s.state, { x: -3, y: 0, moving: true, stridePhase: .1 }, p.start.seconds + .01, key);
    expect([2, 3, 4, 5]).toContain(s.frame % columns);
  });
  it('hit reactions take the reaction row (eight-column heroes) or column 8 (nine-column heroes) and never touch simulation fields', () => {
    const qb = advanceHeroMotion(undefined, { x: 0, y: 0, moving: false, hitFlash: .1 }, 0, 'qb');
    expect(qb.frame).toBeGreaterThanOrEqual(32);
    const coach = advanceHeroMotion(undefined, { x: 0, y: 0, moving: false, hitFlash: .1 }, 0, 'coach');
    expect(coach.frame % 9).toBe(8);
    const actor = { x: 3, y: 4, moving: true, stridePhase: .2, hitFlash: 0 };
    const copy = { ...actor }; advanceHeroMotion(undefined, actor, 1, 'burner');
    expect(actor).toEqual(copy);
  });
  it('heroes differ on the same scripted path (start, stride, turn, stop, attack, hit): nine distinct sequences', () => {
    const path = (key: string) => {
      const columns = heroMotionColumns(key), p = HERO_PRESENTATION[key];
      const { state, frames } = walk(key, 24, [-.4, 0], i => i * .05);
      const out = frames.map(f => f % columns);
      let s = advanceHeroMotion(state, { x: state!.x + 1, y: state!.y, moving: true, stridePhase: .3 }, 1.5, key); out.push(s.frame % columns);
      for (let i = 1; i <= 6; i++) { s = advanceHeroMotion(s.state, { x: s.state.x + .4, y: s.state.y, moving: true, stridePhase: (.3 + i * .07) % 1 }, 1.5 + i * .05, key); out.push(s.frame % columns); }
      for (let i = 0; i < 8; i++) { s = advanceHeroMotion(s.state, { x: s.state.x, y: s.state.y, moving: false }, 2 + i * .05, key); out.push(s.frame % columns); }
      for (const t of [.28, .22, .16, .1, .04]) { const ph = attackPhase(p, t, .28); out.push(ph === 'anticipation' ? 90 + p.attack.anticipationColumn : ph === 'recovery' ? 80 + p.attack.recoveryColumn : 91); }
      out.push(Math.round(Math.abs(reactionOffset(p, p.reaction.seconds, 1).dx)));
      return out.join(',');
    };
    expect(new Set(NINE.map(path)).size).toBe(9);
  });
});

describe('campus patrol', () => {
  it('uses per-hero timings, gestures for gesture heroes only, and a stable, gesture-free stance under reduced motion', () => {
    const travels = new Set(NINE.map(k => heroPatrol(0, 0, false, k).cycle));
    expect(travels.size).toBeGreaterThanOrEqual(6);
    const seesGesture = (key: string) => { for (let t = 0; t < 40; t += .05) if (heroPatrol(t, 0, false, key).gesture) return true; return false; };
    expect(seesGesture('coach')).toBe(true); expect(seesGesture('medic')).toBe(true); expect(seesGesture('playmaker')).toBe(true);
    expect(seesGesture('enforcer')).toBe(false); expect(seesGesture('qb')).toBe(false);
    for (let t = 0; t < 40; t += .5) { const r = heroPatrol(t, 1, true, 'coach'); expect(r.mode).toBe('idle'); expect(r.facing).toBe(-1); expect(r.gesture).toBe(false); expect(r.progress).toBe(.35); }
    // Legacy callers without a key keep the lane variety.
    expect(heroPatrol(0, 0).cycle).not.toBe(heroPatrol(0, 1).cycle);
  });
});
