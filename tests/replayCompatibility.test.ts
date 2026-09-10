// Replay version compatibility: v1 (legacy, no rules field) is accepted for playback by the
// legacy path; v2 requires the current rules version and a complete, self-consistent film.
// Anything else yields an explicit null / "Unsupported match rules", never a silent replay
// under different rules. Complements tests/sharedCombat.test.ts (which covers altered outcome
// inputs, duplicate deployments and key reordering).
import { describe, expect, it } from 'vitest';
import { buildMatchCorpus } from '../game/authority/matchCorpus';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { validateReplay } from '../game/combat/replay';
import { replayMatch } from '../game/combat/engine';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';
import type { ReplayData } from '../battle';

const record = (): ReplayData => { const m = buildMatchCorpus()[0]; return JSON.parse(JSON.stringify(playHeadlessMatch(m.config, m.seed, m.plan).engine.getReplay())); };
const legacyV1 = (): ReplayData => { const r = record(); return { v: 1, seed: r.seed, plan: r.plan, power: r.power, heroes: r.heroes, specials: r.specials, layout: r.layout, script: r.script.filter(a => a.k !== 'd'), squad: r.squad?.map(p => ({ id: p.id, name: p.name, role: p.role, unit: p.unit })) } as ReplayData; };

describe('supported film versions', () => {
  it(`v2 film under ${COMBAT_RULES_VERSION} validates and replays; v1 film validates for legacy playback but cannot use the modern replay path`, () => {
    const v2 = record();
    expect(validateReplay(v2)?.rules).toBe(COMBAT_RULES_VERSION);
    expect(replayMatch(validateReplay(v2)!).matches).toBe(true);
    const v1 = legacyV1();
    expect(validateReplay(v1)).not.toBeNull();
    expect(() => replayMatch(validateReplay(v1)!)).toThrow('Unsupported match rules');
  });
  it('unknown versions and other rules are refused explicitly', () => {
    const r = record();
    expect(validateReplay({ ...r, v: 3 })).toBeNull();
    expect(validateReplay({ ...r, v: 0 })).toBeNull();
    expect(validateReplay({ ...r, rules: 'hero-actions-2' })).toBeNull();
    expect(validateReplay({ ...r, rules: undefined })).toBeNull();
    expect(() => replayMatch({ ...r, rules: 'hero-actions-99' })).toThrow('Unsupported match rules');
  });
});

describe('incomplete, altered and mismatched film', () => {
  it('a v2 film missing any required part is refused', () => {
    const r = record();
    for (const key of ['script', 'ticks', 'finalHash', 'snapshot', 'layout', 'heroes', 'specials', 'seed', 'plan'] as const) {
      const partial = { ...r } as Record<string, unknown>; delete partial[key];
      expect(validateReplay(partial), key).toBeNull();
    }
  });
  it('unknown or unsafe asset ids are refused', () => {
    const r = record();
    expect(validateReplay({ ...r, heroes: r.heroes.map(h => ({ ...h, art: 'https://evil.example/hero.webp' })) })).toBeNull();
    expect(validateReplay({ ...r, heroes: r.heroes.map(h => ({ ...h, art: '/assets/../secret.webp' })) })).toBeNull();
    expect(validateReplay({ ...r, layout: r.layout.map(b => ({ ...b, art: 'data:image/png;base64,AAAA' })) })).toBeNull();
    expect(validateReplay({ ...r, heroes: r.heroes.map(h => ({ ...h, key: 'ghost' })) })).toBeNull();
  });
  it('a snapshot that disagrees with the film it claims to describe is refused', () => {
    const r = record();
    expect(validateReplay({ ...r, snapshot: { ...r.snapshot!, buildings: r.snapshot!.buildings.map(b => ({ ...b, hp: b.hp + 1 })) } })).toBeNull();
    expect(validateReplay({ ...r, snapshot: { ...r.snapshot!, heroes: [] } })).toBeNull();
    expect(validateReplay({ ...r, snapshot: { ...r.snapshot!, replay: { seed: 1, script: [], planKey: 'balanced' } } })).toBeNull();
    const shortened = validateReplay({ ...r, ticks: r.ticks! - 1 }); // a shortened tick count is refused outright or fails verification
    expect(shortened === null || !replayMatch(shortened).matches).toBe(true);
  });
  it('commands that belong to other rules or modes are refused', () => {
    const r = record();
    expect(validateReplay({ ...legacyV1(), script: [{ k: 'd', key: 'noise', tick: 0 }] })).toBeNull(); // v1 has no defense plays
    expect(validateReplay({ ...r, script: [{ k: 'x', tick: 0 } as unknown as ReplayData['script'][number]] })).toBeNull();
    const modeSwapped = validateReplay({ ...r, snapshot: { ...r.snapshot!, mode: 'defense' } });
    expect(modeSwapped === null || !replayMatch(modeSwapped).matches).toBe(true); // either refused or fails verification, never silently accepted
  });
});
