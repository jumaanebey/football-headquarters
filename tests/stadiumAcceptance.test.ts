// Stadium acceptance harness. Every expectation is frozen in tests/fixtures/stadiumScenarios.ts
// and stated before the rules are asked anything; the invariants below are derived from the
// two-possession contract, not from the implementation.
//
// These are the AUTOMATED assertions. Judgments that need an eye — whether a play reads as the
// thing it claims to be, whether the camera is following the right point — are in the gallery
// (npm run stadium:gallery) and recorded separately in docs/STADIUM-ACCEPTANCE.md.
import { describe, expect, it } from 'vitest';
import { STADIUM_SCENARIOS, COVERED_TAGS, UNSUPPORTED_SCENARIOS, type StadiumScenario } from './fixtures/stadiumScenarios';
import { collectScenario, runScenario, SCENARIO_NOW } from './fixtures/stadiumHarness';
import { parseSavedClub } from '../game/saveValidation';
import { applyClubAction } from '../game/authority/clubActions';
import { driveDirection, footballCalls, validStadiumFootball, type FootballEvent, type StadiumFootballGame } from '../game/stadiumFootball';
import { stadiumPerformance } from '../game/presentation/stadiumPerformance';

const REQUIRED_TAGS = [
  'receive-first-home', 'receive-first-away', 'direction-home', 'direction-away',
  'kickoff-return', 'kickoff-coverage', 'return-touchdown',
  'run-power', 'pass-short', 'pass-intermediate', 'pass-deep',
  'defense-zone', 'defense-man', 'defense-run',
  'kick-made', 'kick-missed', 'extra-point-made', 'extra-point-missed', 'two-point-made', 'two-point-missed',
  'touchdown-offense', 'touchdown-finish', 'stop-no-gain', 'conversion-skipped',
  'outcome-win', 'outcome-loss', 'outcome-tie',
] as const;

describe('the catalogue covers the checklist', () => {
  it('demonstrates every required item, and names what the rules cannot produce', () => {
    for (const tag of REQUIRED_TAGS) {
      const scenarios = STADIUM_SCENARIOS.filter(s => s.covers.includes(tag));
      expect(scenarios.length, `no scenario covers ${tag}`).toBeGreaterThan(0);
    }
    expect(COVERED_TAGS.length).toBeGreaterThanOrEqual(REQUIRED_TAGS.length);
    expect(UNSUPPORTED_SCENARIOS.map(u => u.scenario)).toContain('Turnover (interception or fumble)');
    expect(UNSUPPORTED_SCENARIOS.every(u => u.why.length > 40)).toBe(true);
    // Every scenario is uniquely identified and titled, so a failure names something a person can find.
    expect(new Set(STADIUM_SCENARIOS.map(s => s.id)).size).toBe(STADIUM_SCENARIOS.length);
    expect(new Set(STADIUM_SCENARIOS.map(s => s.title)).size).toBe(STADIUM_SCENARIOS.length);
  });
});

describe.each(STADIUM_SCENARIOS.map(s => [s.id, s] as const))('%s', (_id, scenario: StadiumScenario) => {
  const run = runScenario(scenario);
  const final = run.final;
  const events = final.events;

  it('reproduces its frozen result', () => {
    expect(final.phase).toBe('final');
    expect(final.receivesFirst).toBe(scenario.expect.receivesFirst);
    expect({ home: final.home, away: final.away, reward: final.reward }).toEqual({ home: scenario.expect.home, away: scenario.expect.away, reward: scenario.expect.reward });
    expect(events.map(e => e.action)).toEqual(scenario.expect.actions);
    expect(events.map(e => e.scored ?? 0)).toEqual(scenario.expect.scores);
    const outcome = final.home > final.away ? 'win' : final.home === final.away ? 'tie' : 'loss';
    expect(outcome).toBe(scenario.expect.outcome);
  });

  it('accounts for exactly one possession each, in the order the toss decided', () => {
    const order: ('home' | 'away')[] = [];
    for (const e of events) if (order[order.length - 1] !== e.possession) order.push(e.possession!);
    expect(order).toEqual(scenario.expect.receivesFirst === 'home' ? ['home', 'away'] : ['away', 'home']);
    expect(final.possessionIndex).toBe(1);
    // Every event belongs to a possession and drives the way that possession attacks.
    for (const e of events) {
      expect(e.possession === 'home' || e.possession === 'away', `event ${e.turn} has no possession`).toBe(true);
      expect(e.direction).toBe(driveDirection(e.possession!));
    }
  });

  it('moves the score only by what an event recorded, and only for the side that scored', () => {
    let home = 0, away = 0;
    for (const e of events) {
      const points = e.scored ?? 0;
      expect([0, 1, 2, 3, 6], `event ${e.turn} scored ${points}`).toContain(points);
      if (points) { if (e.possession === 'home') home += points; else away += points; }
      expect({ home, away }, `running score after event ${e.turn}`).toEqual({ home: e.home, away: e.away });
    }
    expect({ home, away }).toEqual({ home: final.home, away: final.away });
    // Scores never go down.
    for (let i = 1; i < events.length; i++) {
      expect(events[i].home).toBeGreaterThanOrEqual(events[i - 1].home);
      expect(events[i].away).toBeGreaterThanOrEqual(events[i - 1].away);
    }
  });

  it('keeps the ball on the field, and puts a score in the endzone that possession attacks', () => {
    for (const e of events) {
      expect(e.startYard, `event ${e.turn} start`).toBeGreaterThanOrEqual(0);
      expect(e.startYard!).toBeLessThanOrEqual(100);
      expect(e.endYard, `event ${e.turn} end`).toBeGreaterThanOrEqual(0);
      expect(e.endYard!).toBeLessThanOrEqual(100);
      if ((e.scored ?? 0) >= 6) expect(e.endYard, `touchdown on event ${e.turn}`).toBe(e.possession === 'home' ? 100 : 0);
      // A carry never moves against the direction of the possession.
      if (['return', 'kick', 'pass', 'run'].includes(e.action!) && e.endYard !== e.startYard) {
        expect(Math.sign(e.endYard! - e.startYard!), `event ${e.turn} moved backwards`).toBe(e.direction);
      }
    }
    // Each event starts where the previous one left the ball, unless a possession changed hands.
    for (let i = 1; i < events.length; i++) {
      if (events[i].possession === events[i - 1].possession) {
        const carriedOn = events[i].startYard === events[i - 1].endYard;
        const scoreReset = (events[i - 1].scored ?? 0) >= 6; // a touchdown puts the ball in the endzone; the conversion is not played from there
        expect(carriedOn || scoreReset, `event ${events[i].turn} did not start where event ${events[i - 1].turn} ended`).toBe(true);
      }
    }
  });

  it('restores the identical pending decision after a save round-trip at every step', () => {
    for (const frame of run.frames) {
      const reloaded = parseSavedClub(JSON.stringify(frame.state));
      const game = reloaded.stadiumFootball!.game!;
      expect(game).toEqual(frame.after);
      expect(validStadiumFootball(reloaded.stadiumFootball)).toBe(true);
      expect(footballCalls(game).map(c => c.key)).toEqual(footballCalls(frame.after).map(c => c.key));
    }
  });

  it('pays the stated reward once and records the result', () => {
    const { state, paid } = collectScenario(run);
    expect(paid).toBe(scenario.expect.reward);
    const history = state.stadiumFootball!.history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: final.id, home: final.home, away: final.away, reward: final.reward });
    expect(state.stadiumFootball!.game!.collected).toBe(true);
    const again = applyClubAction(state, { type: 'stadium.collect', gameId: final.id }, { now: SCENARIO_NOW, random: () => 0.5 });
    expect(again.ok, 'a second collect must be refused').toBe(false);
  });

  it('choreographs every event to the endpoint the event recorded', () => {
    // The presentation model is Codex's; this checks it agrees with the rules, not how it looks.
    for (const frame of run.frames) {
      const stage = stadiumPerformance(frame.after, 1);
      const point = endpointOf(frame.after, stage);
      if (point === null) continue;                     // an event with no carried endpoint (a stop in place)
      const target = expectedEndpoint(frame.after.events[frame.after.events.length - 1]);
      expect(Math.abs(point - target), `${scenario.id} event ${frame.index}: choreography settled at ${point.toFixed(1)}, the event records ${target}`).toBeLessThanOrEqual(1.5);
    }
  });
});

/** Where the shipped choreography leaves the play, in field yards. The stage's focus is the point
 *  the camera settles on, which is the carrier for a run, pass or return and the endzone for a
 *  kick — so it is the one value comparable with the event's own geometry. */
function endpointOf(game: StadiumFootballGame, stage: ReturnType<typeof stadiumPerformance>): number | null {
  const event = game.events[game.events.length - 1];
  if (!event || event.startYard === undefined) return null;   // a pre-rewrite event carries no geometry
  return stage.focus.x;
}
/** Where the event says the play ended. A kick is not a carry: it is asked to reach the endzone
 *  the possession attacks, while the ball itself stays on the yard line the event recorded. */
function expectedEndpoint(event: FootballEvent): number {
  const kick = event.action === 'field-goal' || (event.action === 'conversion' && event.call === 'extra-point');
  if (kick) return event.possession === 'home' ? 100 : 0;
  return event.endYard ?? 0;
}
