// Dev-only Stadium scenario gallery. Every supported play from the frozen acceptance catalogue,
// rendered by the SHIPPED StadiumSequence, so a reviewer can look at each one without replaying
// whole games. Nothing here re-implements a rule or a piece of choreography: each card mounts the
// real component on a real game built by the harness.
//
//   npx vite  →  /art/stadium-gallery.html      (never part of the production build)
//   ?tag=kick-made   filter to one checklist item
//   ?wide=1          side-by-side grid, for desktop review
// The app's own stylesheets, so the gallery shows what a player sees rather than unstyled markup.
import '../game-motion.css';
import '../tailwind.css';
import '../game-theme.css';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StadiumSequence } from '../components/StadiumSequence';
import { StadiumFootball } from '../components/StadiumFootball';
import { STADIUM_SCENARIOS, UNSUPPORTED_SCENARIOS, type ScenarioTag } from '../tests/fixtures/stadiumScenarios';
import { runScenario } from '../tests/fixtures/stadiumHarness';
import type { GameState } from '../types';
import type { FootballEvent, StadiumFootballGame } from '../game/stadiumFootball';

const params = new URLSearchParams(location.search);

interface Card { scenarioId: string; title: string; tags: readonly ScenarioTag[]; index: number; game: StadiumFootballGame; event: FootballEvent }

function buildCards(): Card[] {
  const cards: Card[] = [];
  for (const scenario of STADIUM_SCENARIOS) {
    const run = runScenario(scenario);
    run.frames.forEach(frame => {
      const event = frame.after.events[frame.after.events.length - 1];
      cards.push({ scenarioId: scenario.id, title: scenario.title, tags: scenario.covers, index: frame.index, game: frame.after, event });
    });
  }
  return cards;
}

/** `?panel=<scenario id>` renders the shipped Stadium panel on that scenario's final club, so the
 *  viewport checks measure the component players actually see, not only the cards above. */
function Panel({ id, frame }: { id: string; frame: number | null }) {
  const scenario = STADIUM_SCENARIOS.find(s => s.id === id) ?? STADIUM_SCENARIOS[0];
  const run = runScenario(scenario);
  // `frame` picks a club mid-game, where the panel is offering a decision and its call buttons are
  // on screen; without it the panel shows the finished result.
  const club = (frame === null ? run.beforeCollect : run.frames[Math.min(frame, run.frames.length - 1)].state) as GameState;
  const pending = club.stadiumFootball?.game?.phase !== 'final';
  return <main data-panel={scenario.id} data-pending={pending ? '1' : '0'}>
    <section className="scenario">
      <h2>{scenario.id} · {scenario.title} <small>shipped Stadium panel · {pending ? 'awaiting a decision' : 'final state'}</small></h2>
      <div className="events"><article className="event" data-play={`${scenario.id}-panel`}>
        <StadiumFootball club={club} blocked={false} onAction={() => {}} />
      </article></div>
    </section>
  </main>;
}

function Gallery() {
  const cards = useMemo(buildCards, []);
  const tags = useMemo(() => [...new Set(STADIUM_SCENARIOS.flatMap(s => s.covers))].sort(), []);
  const [tag, setTag] = useState(params.get('tag') ?? '');
  const [level, setLevel] = useState(Number(params.get('level') ?? 3));
  const shown = STADIUM_SCENARIOS.filter(s => !tag || s.covers.includes(tag as ScenarioTag));
  return <>
    <header>
      <h1>Stadium scenario gallery</h1>
      <label>Checklist item <select value={tag} onChange={e => setTag(e.target.value)}>
        <option value="">all ({STADIUM_SCENARIOS.length} scenarios · {cards.length} plays)</option>
        {tags.map(t => <option key={t} value={t}>{t}</option>)}
      </select></label>
      <label>Stadium level <select value={level} onChange={e => setLevel(Number(e.target.value))}>{[1, 3, 5].map(l => <option key={l} value={l}>{l}</option>)}</select></label>
      <span style={{ color: '#8fb0c2' }}>{UNSUPPORTED_SCENARIOS.length} scenarios the rules cannot produce are listed at the foot</span>
    </header>
    <main data-wide={params.get('wide') === '1' ? '1' : '0'}>
      {shown.map(scenario => {
        const own = cards.filter(c => c.scenarioId === scenario.id);
        const final = own[own.length - 1]?.game;
        return <section className="scenario" key={scenario.id} data-scenario={scenario.id}>
          <h2>{scenario.id} · {scenario.title}
            <small>{scenario.preset} club · {scenario.expect.receivesFirst} receives first · final {final?.home}–{final?.away} · {scenario.expect.outcome} · {scenario.expect.reward} coins</small></h2>
          <div className="tags">{scenario.covers.map(t => <span key={t}>{t}</span>)}</div>
          <div className="events">
            {own.map(card => <article className="event" key={card.index} data-play={`${card.scenarioId}-${card.index}`}>
              <h3><span>{card.index + 1}. {card.event.title}</span><span>{card.game.home}–{card.game.away}</span></h3>
              <StadiumSequence game={card.game} level={level} />
              <p className="geometry">
                {card.event.possession} · {card.event.action} · {card.event.play ?? 'no play'} · call {card.event.call}
                {' · '}yard {card.event.startYard} → {card.event.endYard} · direction {card.event.direction} · {card.event.scored ? `${card.event.scored} points` : 'no points'}
                {card.event.actors?.length ? ` · ${card.event.actors.map(a => `${a.name} (${a.role} ${a.attribute} ${a.value})`).join(', ')}` : ''}
              </p>
            </article>)}
          </div>
        </section>;
      })}
      <section className="scenario">
        <h2>Not producible by the current rules</h2>
        <div className="events">{UNSUPPORTED_SCENARIOS.map(u => <article className="event" key={u.scenario}>
          <h3><span>{u.scenario}</span></h3><p className="geometry">{u.why}</p></article>)}</div>
      </section>
    </main>
  </>;
}
const panel = params.get('panel');
const frameParam = params.get('frame');
createRoot(document.getElementById('root')!).render(panel ? <Panel id={panel} frame={frameParam === null ? null : Number(frameParam)} /> : <Gallery />);
