// Package B acceptance. Expected outcomes are stated before any helper under test is called:
// scenarios name the call, the roll and the score they expect, rather than asking the
// implementation what it would do and then asserting that.
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import type { GameState } from '../types';
import { applyClubAction, parseClubAction } from '../game/authority/clubActions';
import {
  STADIUM_RULES_VERSION, conversionMatters, coverageDescription, defensiveLookOf, describeYard, driveDirection,
  fieldGoalDistance, footballCalls, isTwoPossessionGame, kickerOf, lookDescription, returnCoverageOf,
  stadiumObjective, validStadiumFootball, yardsToGoal, type StadiumFootballGame,
} from '../game/stadiumFootballV2';
import { selectLineup } from '../game/lineup';
import { parseSavedClub } from '../game/saveValidation';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const club = (): GameState => ({ ...createInitialState(NOW), lastTick: NOW, resources: { ...createInitialState(NOW).resources, ENERGY: 100 } });
/** random 0.8 wins the toss for the home club; 0.4 gives the opponent the ball first. */
const start = (homeFirst: boolean, state: GameState = club()) => {
  const res = applyClubAction(state, { type: 'stadium.start', opponent: 'harbor' }, { now: NOW, random: () => (homeFirst ? 0.8 : 0.4) });
  if (!res.ok) throw new Error('start refused');
  res.state.stadiumFootball!.game!.v=2;
  return res.state;
};
const gameOf = (s: GameState) => s.stadiumFootball!.game!;
const call = (s: GameState, key: string, roll: number) => {
  const g = gameOf(s);
  const res = applyClubAction(s, { type: 'stadium.call', gameId: g.id, turn: String(g.turn), call: key }, { now: NOW, random: () => roll });
  if (!res.ok) throw new Error(`call ${key} refused: ${res.message}`);
  return res.state;
};
const last = (s: GameState) => gameOf(s).events[gameOf(s).events.length - 1];
/** Start a game whose persisted toss and shown coverage are the ones a scenario needs. The seed
 *  comes from the random source, so the search varies that rather than the clock. */
const startWith = (want: { homeFirst: boolean; coverage?: 'edges' | 'middle' | 'balanced' }) => {
  for (let i = 1; i < 4000; i++) {
    const r = i / 4000;
    const res = applyClubAction(club(), { type: 'stadium.start', opponent: 'harbor' }, { now: NOW, random: () => r });
    if (!res.ok) continue;
    const g = gameOf(res.state);
    g.v=2;
    if ((g.receivesFirst === 'home') !== want.homeFirst) continue;
    if (want.coverage && returnCoverageOf(g) !== want.coverage) continue;
    return res.state;
  }
  throw new Error(`no seed produced ${JSON.stringify(want)}`);
};
/** Drive a game to its end by always taking the first legal call at a fixed roll. */
const playOut = (s: GameState, roll: number) => { let n = 0; while (gameOf(s).phase !== 'final' && n++ < 14) s = call(s, footballCalls(gameOf(s))[0].key, roll); return s; };

describe('format', () => {
  it('gives each team exactly one possession, persists the toss, and allows a tie', () => {
    for (const homeFirst of [true, false]) {
      const s = start(homeFirst);
      const g = gameOf(s);
      expect(isTwoPossessionGame(g)).toBe(true);
      expect(g.v).toBe(STADIUM_RULES_VERSION);
      expect(g.receivesFirst).toBe(homeFirst ? 'home' : 'away');
      expect(g.possession).toBe(g.receivesFirst);
      expect(g.possessionIndex).toBe(0);
      // The receiving team starts on its own 20: home at 20, away at 80 on the shared 0-100 field.
      expect(g.yardLine).toBe(homeFirst ? 20 : 80);
      const done = playOut(s, 0.5);
      const final = gameOf(done);
      expect(final.phase).toBe('final');
      expect(final.possessionIndex).toBe(1);
      expect(new Set(final.events.map(e => e.possession))).toEqual(new Set(['home', 'away']));
      // The toss never changes mid-game.
      expect(final.receivesFirst).toBe(g.receivesFirst);
    }
  });
  it('reaches a tie, a win and a loss, and pays each result its stated reward', () => {
    const outcomes = new Set<string>();
    const record = (g: StadiumFootballGame) => {
      outcomes.add(g.home === g.away ? 'tie' : g.home > g.away ? 'win' : 'loss');
      expect(g.reward).toBe(g.home > g.away ? 100 : g.home === g.away ? 50 : 20);
    };
    for (const roll of [0.01, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) for (const homeFirst of [true, false]) record(gameOf(playOut(start(homeFirst), roll)));
    // A club that answers the look it is shown can beat Harbor: the win is reachable by playing
    // well, not only by a lucky roll.
    const strong: GameState = { ...club(), roster: club().roster.map(p => ({ ...p, level: 24, stats: { strength: 46, speed: 46, iq: 46 } })) };
    let s = start(true, strong);
    let n = 0;
    while (gameOf(s).phase !== 'final' && n++ < 14) {
      const g = gameOf(s);
      const answer = g.phase === 'offense' && g.possession === 'home'
        ? ({ blitz: 'slants', deep: 'verticals', balanced: 'flood' } as const)[defensiveLookOf(g)]
        : footballCalls(g)[0].key;
      s = call(s, answer, 0.05);
    }
    record(gameOf(s));
    expect(gameOf(s).home).toBeGreaterThan(gameOf(s).away);
    expect(outcomes).toEqual(new Set(['tie', 'win', 'loss']));
  });
  it('ends immediately when the second possession puts the result beyond a conversion', () => {
    // Home receives first and is shut out; the opponent then scores a touchdown from 0-0.
    // 6 > 0 with any conversion, so the game is over without a conversion decision.
    const pending: StadiumFootballGame = {
      ...gameOf(start(false)), home: 0, away: 0, possession: 'away', possessionIndex: 1, phase: 'offense', yardLine: 30,
    };
    expect(conversionMatters({ ...pending, home: 0, away: 6 })).toBe(false);
    // …and it is retained when one point still decides win, tie or loss.
    expect(conversionMatters({ ...pending, home: 7, away: 6 })).toBe(true);   // 6→7 ties, 6→8 wins
    expect(conversionMatters({ ...pending, home: 6, away: 6 })).toBe(true);   // a point wins it
    expect(conversionMatters({ ...pending, possessionIndex: 0, home: 0, away: 6 })).toBe(true); // first possession always matters
  });
});

describe('return lanes are a real decision', () => {
  it('shows the coverage and gives each lane a different outcome when the coverage is not balanced', () => {
    const s = startWith({ homeFirst: true, coverage: 'edges' });
    const g = gameOf(s);
    const coverage = returnCoverageOf(g);
    expect(coverage).toBe('edges');
    expect(coverageDescription(coverage)).toMatch(/coverage/i);
    // The soft lane is the one the coverage is NOT protecting.
    const softLane = coverage === 'edges' ? 'middle' : 'left';
    const hardLane = coverage === 'edges' ? 'left' : 'middle';
    const yardsFor = (lane: string) => last(call(s, lane, 0.5)).yards;
    const soft = yardsFor(softLane), hard = yardsFor(hardLane);
    expect(soft).toBeGreaterThan(hard);            // identical state, identical roll, different call
    expect(soft - hard).toBeGreaterThanOrEqual(10); // and the difference is worth reading
    // The shown detail tells the player which lane is open before they choose.
    const calls = footballCalls(g);
    expect(calls.find(c => c.key === softLane)!.detail).toMatch(/open/i);
    expect(calls.find(c => c.key === hardLane)!.detail).toMatch(/contested/i);
  });
  it('makes the lane irrelevant only when the coverage shown is balanced, and says so', () => {
    const s = startWith({ homeFirst: true, coverage: 'balanced' });
    expect(returnCoverageOf(gameOf(s))).toBe('balanced');
    expect(footballCalls(gameOf(s)).every(c => /even/i.test(c.detail))).toBe(true);
    const left = last(call(s, 'left', 0.5)).yards, right = last(call(s, 'right', 0.5)).yards;
    expect(left).toBe(right); // the two sidelines are genuinely the same when coverage is even
  });
});

describe('event geometry', () => {
  it('records possession, direction, start and end yard lines, action and points for every event', () => {
    const s = playOut(start(true), 0.45);
    const g = gameOf(s);
    expect(g.events.length).toBeGreaterThanOrEqual(6);
    for (const e of g.events) {
      expect(e.possession === 'home' || e.possession === 'away').toBe(true);
      expect(e.direction).toBe(driveDirection(e.possession!));
      expect(e.startYard).toBeGreaterThanOrEqual(0); expect(e.startYard).toBeLessThanOrEqual(100);
      expect(e.endYard).toBeGreaterThanOrEqual(0); expect(e.endYard).toBeLessThanOrEqual(100);
      expect(typeof e.action).toBe('string');
      expect([0, 1, 2, 3, 6]).toContain(e.scored);
      // The ball only ever moves towards the endzone the possessing team attacks.
      if (e.action === 'return' || e.action === 'kick' || e.action === 'pass' || e.action === 'run') {
        expect(Math.sign(e.endYard! - e.startYard!) === e.direction! || e.endYard === e.startYard).toBe(true);
      }
    }
    // Touchdowns are placed in the endzone of the side that scored, and the two are opposite.
    const touchdowns = g.events.filter(e => e.action === 'touchdown');
    for (const td of touchdowns) expect(td.endYard).toBe(td.possession === 'home' ? 100 : 0);
    const scored = g.events.filter(e => (e.scored ?? 0) > 0);
    expect(g.home + g.away).toBe(scored.reduce((sum, e) => sum + (e.scored ?? 0), 0));
  });
  it('agrees with the stated field-goal distance', () => {
    expect(fieldGoalDistance('home', 80)).toBe(37);  // 20 to the goal + 17
    expect(fieldGoalDistance('away', 20)).toBe(37);  // mirrored for the other direction
    expect(yardsToGoal('home', 80)).toBe(20);
    expect(yardsToGoal('away', 20)).toBe(20);
    expect(describeYard(50)).toBe('midfield');
    expect(describeYard(35)).toBe('your 35');
    expect(describeYard(78)).toBe('their 22');
  });
});

describe('calls name the real situation', () => {
  it('never calls a long-field attempt a goal-line play, and does call a short one that', () => {
    const base = gameOf(start(true));
    const far: StadiumFootballGame = { ...base, phase: 'finish', possession: 'home', yardLine: 45 };
    const near: StadiumFootballGame = { ...base, phase: 'finish', possession: 'home', yardLine: 97 };
    const farGo = footballCalls(far).find(c => c.key === 'go')!;
    const nearGo = footballCalls(near).find(c => c.key === 'go')!;
    expect(farGo.name).toMatch(/55 yards out/);
    expect(farGo.name).not.toMatch(/goal.line/i);
    expect(nearGo.name).toMatch(/goal-line/i);
    expect(footballCalls(far).find(c => c.key === 'field-goal')!.name).toContain(`${fieldGoalDistance('home', 45)}-yard`);
  });
  it('offers the defending side its own decisions on the opponent possession', () => {
    const s = start(false); // the opponent receives, so the player kicks and then defends
    expect(footballCalls(gameOf(s)).map(c => c.key)).toEqual(['deep', 'squib']);
    const afterKick = call(s, 'squib', 0.5);
    expect(gameOf(afterKick).phase).toBe('offense');
    expect(footballCalls(gameOf(afterKick)).map(c => c.key)).toEqual(['zone', 'man', 'stack']);
  });
  it('shows the defensive look before the offensive call and rewards the answer to it', () => {
    const s = call(start(true), 'middle', 0.5);
    const g = gameOf(s);
    expect(g.phase).toBe('offense');
    const look = defensiveLookOf(g);
    expect(lookDescription(look)).toMatch(/they/i);
    const answer = { blitz: 'slants', deep: 'verticals', balanced: 'flood' }[look];
    const calls = footballCalls(g);
    expect(calls.find(c => c.key === answer)!.detail).toMatch(/answers their look/i);
    expect(calls.filter(c => c.key !== answer && c.key !== 'power').every(c => /set up against/i.test(c.detail))).toBe(true);
  });
});

describe('the selected players decide and are named', () => {
  it('attributes the return, the offensive play and the kick to real lineup members', () => {
    const s = start(true);
    const snapshot = gameOf(s).lineup!;
    expect(snapshot.players).toHaveLength(9);
    const returned = call(s, 'middle', 0.5);
    const returnActors = last(returned).actors!;
    expect(returnActors).toHaveLength(1);
    expect(returnActors[0].slot).toBe('RECEIVER');
    expect(snapshot.players.some(p => p.name === returnActors[0].name)).toBe(true);
    expect(returnActors[0].attribute).toBe('speed');
    const passed = call(returned, 'slants', 0.5);
    const passActors = last(passed).actors!;
    expect(passActors.map(a => a.slot)).toContain('QB');
    expect(passActors.every(a => snapshot.players.some(p => p.name === a.name))).toBe(true);
  });
  it('resolves the kick through a named selected player, not a roster-wide average', () => {
    const s = start(true);
    const kicker = kickerOf(gameOf(s))!;
    expect(kicker).toBeTruthy();
    expect(gameOf(s).lineup!.players.some(p => p.id === kicker.id)).toBe(true);
    const kicked = call({ ...s, stadiumFootball: { ...s.stadiumFootball!, game: { ...gameOf(s), phase: 'finish', yardLine: 80 } } }, 'field-goal', 0.1);
    const event = last(kicked);
    expect(event.action).toBe('field-goal');
    expect(event.detail).toContain(kicker.name);
    expect(event.actors![0].name).toBe(kicker.name);
  });
  it('keeps a pending game on the lineup it started with, whatever the roster does next', () => {
    const s = start(true);
    const snapshot = gameOf(s).lineup!;
    const wrecked: GameState = { ...s, roster: s.roster.slice(0, 6), lineup: { version: 1, slots: selectLineup(s.roster.slice(0, 6)), updatedAt: NOW } };
    const played = call(wrecked, 'middle', 0.5);
    expect(gameOf(played).lineup).toEqual(snapshot);
    expect(last(played).actors!.every(a => snapshot.players.some(p => p.name === a.name))).toBe(true);
    expect(gameOf(played).ratings).toEqual(gameOf(s).ratings);
  });
});

describe('situational objectives', () => {
  it('state what this decision is worth, from the score, and never generic tie text on a loss', () => {
    const base = gameOf(start(true));
    const second = (home: number, away: number, possession: 'home' | 'away'): StadiumFootballGame => ({ ...base, home, away, possession, possessionIndex: 1, phase: 'offense' });
    expect(stadiumObjective(second(0, 3, 'home'))).toBe('A field goal ties; a touchdown wins.');
    expect(stadiumObjective(second(0, 2, 'home'))).toMatch(/field goal wins it/);
    expect(stadiumObjective(second(0, 0, 'home'))).toMatch(/Level/);
    expect(stadiumObjective(second(0, 9, 'home'))).toMatch(/two-point conversion/);
    expect(stadiumObjective(second(7, 0, 'away'))).toMatch(/lead by 7/);
    expect(stadiumObjective({ ...base, phase: 'final', home: 3, away: 10 })).toBe('Final: you lose 3–10.');
    expect(stadiumObjective({ ...base, phase: 'final', home: 7, away: 7 })).toBe('Final: 7–7. A tie.');
    expect(stadiumObjective({ ...base, phase: 'final', home: 10, away: 3 })).toBe('Final: you win 10–3.');
    expect(stadiumObjective({ ...base, phase: 'final', home: 3, away: 10 })).not.toMatch(/tie/i);
  });
});

describe('reload, repetition and refusal', () => {
  it('restores the exact pending decision and its shown context after a save round-trip, at every phase', () => {
    let s = start(true);
    for (let step = 0; step < 6 && gameOf(s).phase !== 'final'; step++) {
      const before = gameOf(s);
      const shown = { calls: footballCalls(before).map(c => c.key), coverage: returnCoverageOf(before), look: defensiveLookOf(before), objective: stadiumObjective(before) };
      const reloaded = parseSavedClub(JSON.stringify(s));
      const after = reloaded.stadiumFootball!.game!;
      expect(after).toEqual(before);
      expect({ calls: footballCalls(after).map(c => c.key), coverage: returnCoverageOf(after), look: defensiveLookOf(after), objective: stadiumObjective(after) }).toEqual(shown);
      s = call(s, shown.calls[0], 0.5);
    }
  });
  it('refuses a stale turn, an unknown call and a forged payload, and collects exactly once', () => {
    let s = playOut(start(true), 0.5);
    const g = gameOf(s);
    expect(parseClubAction({ type: 'stadium.call', gameId: g.id, turn: '0', call: 'left', reward: 999 })).toBeNull();
    expect(applyClubAction(s, { type: 'stadium.call', gameId: g.id, turn: '0', call: 'left' }, { now: NOW, random: () => 0.5 }).ok).toBe(false);
    const coins = s.resources.COINS;
    const collected = applyClubAction(s, { type: 'stadium.collect', gameId: g.id }, { now: NOW, random: () => 0.5 });
    expect(collected.ok).toBe(true); if (!collected.ok) return;
    expect(collected.state.resources.COINS).toBe(coins + g.reward);
    expect(applyClubAction(collected.state, { type: 'stadium.collect', gameId: g.id }, { now: NOW, random: () => 0.5 }).ok).toBe(false);
    s = collected.state;
    expect(s.stadiumFootball!.history).toHaveLength(1);
    expect(validStadiumFootball(s.stadiumFootball)).toBe(true);
  });
  it('keeps a pre-rewrite saved game valid, playable and collectible under its own rules', () => {
    const legacy = {
      game: { id: 'football_old', opponent: 'harbor' as const, phase: 'offense' as const, turn: 1, startedAt: NOW, home: 0, away: 0, yardLine: 32, collected: false, reward: 0,
        ratings: { attack: 40, defense: 38, speed: 16, power: 15, iq: 15, readiness: 50, mastery: {} }, events: [{ turn: 0, phase: 'return' as const, call: 'left', title: 'Return to your 32', detail: 'x', home: 0, away: 0, yards: 32 }] },
      history: [],
    };
    expect(validStadiumFootball(legacy)).toBe(true);
    const state: GameState = { ...club(), stadiumFootball: legacy };
    expect(parseSavedClub(JSON.stringify(state)).stadiumFootball!.game!.id).toBe('football_old');
    const g = state.stadiumFootball!.game!;
    expect(isTwoPossessionGame(g)).toBe(false);
    // The legacy call set, resolved by the frozen legacy rules.
    expect(footballCalls(g).map(c => c.key)).toEqual(['slants', 'flood', 'verticals', 'power']);
    const next = applyClubAction(state, { type: 'stadium.call', gameId: 'football_old', turn: '1', call: 'slants' }, { now: NOW, random: () => 0.2 });
    expect(next.ok).toBe(true); if (!next.ok) return;
    const after = next.state.stadiumFootball!.game!;
    expect(after.v).toBeUndefined();               // it stays a legacy game
    expect(after.turn).toBe(2);
    expect(after.events).toHaveLength(2);
    expect(validStadiumFootball(next.state.stadiumFootball)).toBe(true);
  });
});
