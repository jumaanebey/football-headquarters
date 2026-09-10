import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { battleContributions, contributionLeaders, resultPresentation } from '../game/battleDebrief';
import { applyBuildingYardage, applyTroopPressure, recover } from '../game/combat/actions';
import { createBattleEngine } from '../game/combat/engine';
import { heroPracticeConfig } from '../game/combat/practice';
import { BattleDebrief } from '../components/BattleDebrief';
import type { BattleConfig, BattleResult } from '../game/combat/contracts';
import type { BTroop } from '../battle';

const fixture = (key = 'medic') => {
  const config = heroPracticeConfig(key);
  const engine = createBattleEngine(config, 824);
  engine.command({ k: 'h', key, x: 8, y: 80, tick: 0 });
  return { config, engine, hero: engine.state.troops[0] };
};
const result: BattleResult = { mode: 'attack', title: 'Recorded drive', won: true, stars: 3, pct: 100, coins: 600, fans: 30 };
const replay = { version: 2 as const, seed: 824, script: [], planKey: 'balanced' };
const markup = (config: BattleConfig, outcome = result, actors: BTroop[] = []) => renderToStaticMarkup(
  <BattleDebrief config={config} result={outcome} actors={actors} stats={null} modernCombat replayVerified onContinue={() => {}} onPracticeAgain={() => {}} />,
);

describe('measured battle standouts', () => {
  it('credits effective recovery and protection separately from yardage without mutating actors', () => {
    const { config, engine, hero } = fixture();
    const ally = { ...hero, id: 'ally', isHero: false, heroKey: undefined, hp: 80, maxHp: 100 };
    recover(hero, ally, 1000);
    ally.shieldT = 5; ally.shieldSource = hero.id;
    applyTroopPressure(ally, 60, [hero, ally]);
    const building = engine.state.buildings[0]; building.hp = 12;
    applyBuildingYardage(ally, building, 1000);
    const actors = [hero, ally]; const before = JSON.stringify(actors);
    const leaders = contributionLeaders(battleContributions(actors, config.heroes!));
    expect(leaders.map(({ metric, amount }) => [metric, amount])).toEqual([['yardage', 12], ['recovery', 20], ['protection', 30]]);
    expect(leaders.find(item => item.metric === 'recovery')?.actor.heroKey).toBe('medic');
    expect(JSON.stringify(actors)).toBe(before);
  });

  it('retains a substituted hero’s earned contribution and the actual player name', () => {
    const { config, hero } = fixture();
    hero.dead = true; hero.healingDone = 125;
    const player = { ...hero, id: 'player', isHero: false, heroKey: undefined, nameTag: 'Jay Bey', dmg: 80, healingDone: 0 };
    const leaders = contributionLeaders(battleContributions([hero, player], config.heroes!));
    expect(leaders.find(item => item.metric === 'yardage')?.actor.name).toBe('Jay Bey');
    expect(leaders.find(item => item.metric === 'recovery')?.amount).toBe(125);
  });

  it('does not award an empty or invalid statline', () => {
    const { config, hero } = fixture();
    hero.dmg = NaN; hero.healingDone = -1; hero.protectionDone = Infinity;
    expect(contributionLeaders(battleContributions([hero], config.heroes!))).toEqual([]);
    expect(contributionLeaders([])).toEqual([]);
  });

  it('keeps ties stable and compares measured values before rounding', () => {
    const { config, hero } = fixture();
    const rows = battleContributions([{ ...hero, dmg: 10.1 }, { ...hero, id: 'second', dmg: 10.2 }], config.heroes!);
    expect(contributionLeaders(rows)[0].actor.id).toBe('second');
    rows[0].yardage = 10.2;
    expect(contributionLeaders(rows)[0].actor.id).toBe(hero.id);
  });
});

describe('results from the viewer’s perspective', () => {
  it.each([true, false])('shows an attack replay from the defender’s perspective (attacker won: %s)', won => {
    const config = { ...heroPracticeConfig('qb'), practice: false, replay };
    const outcome = { ...result, won }; const before = JSON.stringify(outcome);
    const presentation = resultPresentation(config, outcome);
    expect(presentation.viewerWon).toBe(!won);
    expect(presentation.headline).toBe(won ? 'Your defense was beaten' : 'Your defense held');
    expect(presentation.eyebrow).toBe('Recorded drive');
    expect(JSON.stringify(outcome)).toBe(before);
  });

  it.each([true, false])('does not invert a defense-mode recording (defense won: %s)', won => {
    const config = { ...heroPracticeConfig('qb'), mode: 'defense' as const, practice: false, replay };
    expect(resultPresentation(config, { ...result, mode: 'defense', won }).viewerWon).toBe(won);
  });

  it('never describes a recorded purse as a new reward or the attacker’s heroes as yours', () => {
    const { config, hero } = fixture(); hero.dmg = 80;
    const html = markup({ ...config, practice: false, replay }, result, [hero]);
    expect(html).toContain('The attacking team’s standouts');
    expect(html).toContain('Your defense was beaten');
    expect(html).toContain('Close replay');
    expect(html).not.toContain('Coins won');
    expect(html).not.toContain('Collect rewards');
    expect(html).not.toContain('You won');
  });

  it('keeps free retry and return controls in the sheet footer', () => {
    const html = markup(heroPracticeConfig('qb'));
    const footer = html.slice(html.indexOf('fhq-sheet-footer'));
    expect(footer).toContain('Practice again · Free');
    expect(footer).toContain('Back to Hero Film Room');
    expect(html).not.toContain('Coins won');
    expect(html).toContain('overflow-y-auto');
  });

  it('preserves earned attack rewards and gauntlet wave purses', () => {
    const config = { ...heroPracticeConfig('qb'), practice: false };
    expect(markup(config)).toContain('Collect rewards');
    expect(markup(config)).toContain('+600');
    const html = markup({ ...config, mode: 'defense' }, { ...result, mode: 'defense', gauntletTier: 1, wavesHeld: 3, gauntletCleared: false });
    expect(html).toContain('Night purse');
    expect(html).toContain('3 / 5');
    expect(html).toContain('Back to base');
  });
});
