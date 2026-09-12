// Frozen Stadium acceptance scenarios.
//
// Each entry is a club preset, the random value that starts the game (fixing the coin toss and the
// seed that shown context derives from) and a list of (call, roll) steps. Replaying one through the
// shipped rules reproduces the same game every time, so the expectations below are stated here —
// score, the action of every event, the points each event scored, and the reward — rather than
// asked of the code under test.
//
// Discovered by `npm run stadium:search` (seeded sampling over legal calls and rolls) and then
// frozen. If a rules change moves any of these outcomes, the acceptance tests fail with the
// scenario named, which is the point.
import type { ClubPreset, ScenarioStep } from './stadiumHarness';
import type { StadiumOpponent } from '../../game/stadiumFootball';

/** Checklist items a scenario demonstrates. See docs/STADIUM-ACCEPTANCE.md for the full list. */
export type ScenarioTag =
  | 'receive-first-home' | 'receive-first-away' | 'direction-home' | 'direction-away'
  | 'kickoff-return' | 'kickoff-coverage' | 'return-touchdown'
  | 'run-power' | 'pass-short' | 'pass-intermediate' | 'pass-deep'
  | 'defense-zone' | 'defense-man' | 'defense-run'
  | 'kick-made' | 'kick-missed' | 'extra-point-made' | 'extra-point-missed' | 'two-point-made' | 'two-point-missed'
  | 'touchdown-offense' | 'touchdown-finish' | 'stop-no-gain' | 'conversion-skipped'
  | 'outcome-win' | 'outcome-loss' | 'outcome-tie';

export interface StadiumScenario {
  id: string;
  title: string;
  preset: ClubPreset;
  opponent: StadiumOpponent;
  startRandom: number;
  covers: readonly ScenarioTag[];
  steps: readonly ScenarioStep[];
  expect: {
    receivesFirst: 'home' | 'away';
    home: number; away: number; reward: number;
    outcome: 'win' | 'loss' | 'tie';
    /** The action kind recorded by each event, in order. */
    actions: readonly string[];
    /** Points scored by each event, in order. */
    scores: readonly number[];
  };
}

export const STADIUM_SCENARIOS: readonly StadiumScenario[] = [
  {
    id: 'S01', title: "Field goal missed",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-man", "direction-away", "direction-home", "kick-made", "kick-missed", "kickoff-coverage", "kickoff-return", "outcome-loss", "pass-deep", "receive-first-away"],
    steps: [{ call: 'squib', roll: 0.02 }, { call: 'man', roll: 0.45 }, { call: 'contain', roll: 0.3 }, { call: 'right', roll: 0.97 }, { call: 'verticals', roll: 0.88 }, { call: 'field-goal', roll: 0.97 }],
    expect: {
      receivesFirst: 'away', home: 0, away: 3, reward: 20,
      outcome: 'loss',
      actions: ["kick", "stop", "field-goal", "return", "pass", "field-goal"],
      scores: [0, 0, 3, 0, 0, 0],
    },
  },
  {
    id: 'S02', title: "Field goal missed (2)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-zone", "direction-away", "direction-home", "kick-made", "kick-missed", "kickoff-coverage", "kickoff-return", "outcome-loss", "pass-intermediate", "receive-first-away"],
    steps: [{ call: 'deep', roll: 0.45 }, { call: 'zone', roll: 0.88 }, { call: 'pressure', roll: 0.3 }, { call: 'right', roll: 0.02 }, { call: 'flood', roll: 0.75 }, { call: 'field-goal', roll: 0.3 }],
    expect: {
      receivesFirst: 'away', home: 0, away: 3, reward: 20,
      outcome: 'loss',
      actions: ["kick", "stop", "field-goal", "return", "pass", "field-goal"],
      scores: [0, 0, 3, 0, 0, 0],
    },
  },
  {
    id: 'S03', title: "Field goal missed (3)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-zone", "direction-away", "direction-home", "kick-missed", "kickoff-coverage", "kickoff-return", "outcome-loss", "pass-intermediate", "receive-first-away", "touchdown-offense"],
    steps: [{ call: 'deep', roll: 0.97 }, { call: 'zone', roll: 0.12 }, { call: 'block', roll: 0.97 }, { call: 'middle', roll: 0.88 }, { call: 'flood', roll: 0.12 }, { call: 'field-goal', roll: 0.88 }],
    expect: {
      receivesFirst: 'away', home: 0, away: 6, reward: 20,
      outcome: 'loss',
      actions: ["kick", "touchdown", "conversion", "return", "pass", "field-goal"],
      scores: [0, 6, 0, 0, 0, 0],
    },
  },
  {
    id: 'S04', title: "Touchdown from the offensive call",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-zone", "direction-away", "direction-home", "kickoff-coverage", "kickoff-return", "outcome-loss", "pass-short", "receive-first-away", "stop-no-gain", "touchdown-offense"],
    steps: [{ call: 'squib', roll: 0.75 }, { call: 'zone', roll: 0.12 }, { call: 'contain', roll: 0.45 }, { call: 'right', roll: 0.88 }, { call: 'slants', roll: 0.6 }, { call: 'go', roll: 0.75 }],
    expect: {
      receivesFirst: 'away', home: 0, away: 7, reward: 20,
      outcome: 'loss',
      actions: ["kick", "touchdown", "conversion", "return", "pass", "stop"],
      scores: [0, 6, 1, 0, 0, 0],
    },
  },
  {
    id: 'S05', title: "Kickoff return taken the distance",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["direction-away", "direction-home", "kickoff-return", "outcome-tie", "pass-intermediate", "receive-first-away", "return-touchdown", "touchdown-finish", "two-point-missed"],
    steps: [{ call: 'deep', roll: 0.02 }, { call: 'contain', roll: 0.97 }, { call: 'left', roll: 0.6 }, { call: 'flood', roll: 0.97 }, { call: 'go', roll: 0.0005 }, { call: 'two-point', roll: 0.6 }],
    expect: {
      receivesFirst: 'away', home: 6, away: 6, reward: 50,
      outcome: 'tie',
      actions: ["touchdown", "conversion", "return", "pass", "touchdown", "conversion"],
      scores: [6, 0, 0, 0, 6, 0],
    },
  },
  {
    id: 'S06', title: "Field goal missed (4)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-run", "direction-away", "direction-home", "kick-missed", "kickoff-coverage", "kickoff-return", "outcome-tie", "pass-deep", "receive-first-away", "stop-no-gain"],
    steps: [{ call: 'squib', roll: 0.88 }, { call: 'stack', roll: 0.45 }, { call: 'contain', roll: 0.6 }, { call: 'right', roll: 0.3 }, { call: 'verticals', roll: 0.45 }, { call: 'go', roll: 0.88 }],
    expect: {
      receivesFirst: 'away', home: 0, away: 0, reward: 50,
      outcome: 'tie',
      actions: ["kick", "stop", "field-goal", "return", "pass", "stop"],
      scores: [0, 0, 0, 0, 0, 0],
    },
  },
  {
    id: 'S07', title: "Touchdown from the offensive call (2)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-zone", "direction-away", "direction-home", "kickoff-coverage", "kickoff-return", "outcome-loss", "receive-first-away", "run-power", "stop-no-gain", "touchdown-offense"],
    steps: [{ call: 'deep', roll: 0.45 }, { call: 'zone', roll: 0.0005 }, { call: 'block', roll: 0.3 }, { call: 'left', roll: 0.88 }, { call: 'power', roll: 0.3 }, { call: 'go', roll: 0.97 }],
    expect: {
      receivesFirst: 'away', home: 0, away: 7, reward: 20,
      outcome: 'loss',
      actions: ["kick", "touchdown", "conversion", "return", "run", "stop"],
      scores: [0, 6, 1, 0, 0, 0],
    },
  },
  {
    id: 'S08', title: "Kickoff return taken the distance (2)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-zone", "direction-away", "direction-home", "extra-point-made", "kickoff-coverage", "outcome-tie", "receive-first-away", "return-touchdown", "touchdown-offense"],
    steps: [{ call: 'squib', roll: 0.12 }, { call: 'zone', roll: 0.0005 }, { call: 'contain', roll: 0.6 }, { call: 'middle', roll: 0.12 }, { call: 'extra-point', roll: 0.45 }],
    expect: {
      receivesFirst: 'away', home: 7, away: 7, reward: 50,
      outcome: 'tie',
      actions: ["kick", "touchdown", "conversion", "touchdown", "conversion"],
      scores: [0, 6, 1, 6, 1],
    },
  },
  {
    id: 'S09', title: "Extra point good",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-man", "direction-away", "direction-home", "extra-point-made", "kickoff-coverage", "kickoff-return", "outcome-win", "receive-first-away", "touchdown-offense"],
    steps: [{ call: 'deep', roll: 0.97 }, { call: 'man', roll: 0.12 }, { call: 'block', roll: 0.88 }, { call: 'right', roll: 0.02 }, { call: 'verticals', roll: 0.02 }, { call: 'extra-point', roll: 0.12 }],
    expect: {
      receivesFirst: 'away', home: 7, away: 6, reward: 100,
      outcome: 'win',
      actions: ["kick", "touchdown", "conversion", "return", "touchdown", "conversion"],
      scores: [0, 6, 0, 0, 6, 1],
    },
  },
  {
    id: 'S10', title: "A second-possession touchdown that ends it without a conversion",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["conversion-skipped", "defense-zone", "direction-away", "direction-home", "kick-made", "kickoff-coverage", "kickoff-return", "outcome-win", "receive-first-away", "touchdown-offense"],
    steps: [{ call: 'squib', roll: 0.6 }, { call: 'zone', roll: 0.3 }, { call: 'pressure', roll: 0.02 }, { call: 'middle', roll: 0.3 }, { call: 'slants', roll: 0.02 }],
    expect: {
      receivesFirst: 'away', home: 6, away: 3, reward: 100,
      outcome: 'win',
      actions: ["kick", "stop", "field-goal", "return", "touchdown"],
      scores: [0, 0, 3, 0, 6],
    },
  },
  {
    id: 'S11', title: "Two-point conversion good",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-man", "direction-away", "direction-home", "kickoff-coverage", "kickoff-return", "outcome-win", "receive-first-away", "run-power", "touchdown-finish", "touchdown-offense", "two-point-made"],
    steps: [{ call: 'squib', roll: 0.88 }, { call: 'man', roll: 0.3 }, { call: 'contain', roll: 0.02 }, { call: 'middle', roll: 0.6 }, { call: 'power', roll: 0.88 }, { call: 'go', roll: 0.12 }, { call: 'two-point', roll: 0.12 }],
    expect: {
      receivesFirst: 'away', home: 8, away: 7, reward: 100,
      outcome: 'win',
      actions: ["kick", "touchdown", "conversion", "return", "run", "touchdown", "conversion"],
      scores: [0, 6, 1, 0, 0, 6, 2],
    },
  },
  {
    id: 'S12', title: "Kickoff return taken the distance (3)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.024390243902439025,
    covers: ["defense-man", "direction-away", "direction-home", "extra-point-missed", "kickoff-coverage", "outcome-loss", "receive-first-away", "return-touchdown", "touchdown-offense"],
    steps: [{ call: 'squib', roll: 0.45 }, { call: 'man', roll: 0.3 }, { call: 'block', roll: 0.3 }, { call: 'right', roll: 0.0005 }, { call: 'extra-point', roll: 0.97 }],
    expect: {
      receivesFirst: 'away', home: 6, away: 7, reward: 20,
      outcome: 'loss',
      actions: ["kick", "touchdown", "conversion", "touchdown", "conversion"],
      scores: [0, 6, 1, 6, 0],
    },
  },
  {
    id: 'S13', title: "Extra point good (2)",
    preset: 'starter', opponent: 'harbor', startRandom: 0.07317073170731707,
    covers: ["defense-run", "direction-away", "direction-home", "extra-point-made", "kick-missed", "kickoff-coverage", "kickoff-return", "outcome-win", "receive-first-home", "touchdown-offense"],
    steps: [{ call: 'right', roll: 0.75 }, { call: 'slants', roll: 0.0005 }, { call: 'extra-point', roll: 0.3 }, { call: 'deep', roll: 0.6 }, { call: 'stack', roll: 0.6 }, { call: 'pressure', roll: 0.45 }],
    expect: {
      receivesFirst: 'home', home: 7, away: 0, reward: 100,
      outcome: 'win',
      actions: ["return", "touchdown", "conversion", "kick", "stop", "field-goal"],
      scores: [0, 6, 1, 0, 0, 0],
    },
  },
];

/** Every checklist tag the catalogue demonstrates. */
export const COVERED_TAGS: readonly ScenarioTag[] = [...new Set(STADIUM_SCENARIOS.flatMap(s => s.covers))].sort() as ScenarioTag[];

/**
 * Scenarios the current rules cannot produce, recorded so the gap is explicit rather than assumed
 * covered. Each states what would have to change for it to exist.
 */
export const UNSUPPORTED_SCENARIOS: readonly { scenario: string; why: string }[] = [
  { scenario: 'Inside versus outside run from scrimmage', why: 'Scrimmage runs have exactly one call (`power`); inside and outside are distinguished only on the kickoff return, where the lanes are left, middle and right. A second run call would be a rules change.' },
  { scenario: 'Turnover (interception or fumble)', why: 'No resolution produces a change of possession inside a possession. The two-possession contract gives each team exactly one, so a turnover would need its own possession and scoring treatment.' },
  { scenario: 'Safety', why: 'The ball never moves behind the possessing team\'s own goal line: `advance` clamps to 0..100 and no resolution awards two points to the defence.' },
  { scenario: 'Punt', why: 'There is no punt call; a possession that fails to score ends where it stands and the other team starts from its own 20.' },
  { scenario: 'Overtime or sudden death', why: 'Settled product decision: exactly one possession each, and ties are valid results.' },
  { scenario: 'A defensive score (returned interception or blocked kick returned)', why: 'Blocking a kick denies points; it never awards them. There is no resolution that scores for the team without the ball.' },
  { scenario: 'Clock expiry', why: 'Possessions advance only on confirmed calls. Nothing in the Stadium advances on elapsed time, which is what keeps a reload safe.' },
];
