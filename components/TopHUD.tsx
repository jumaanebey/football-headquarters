import { ClubCrest } from './ClubStyle';
import React, { useEffect, useRef, useState } from 'react';
import { Crown, Users, Megaphone, Trophy, ChevronRight, Zap, Coins } from 'lucide-react';
import { GameState } from '../types';
import { rallyPreview } from '../game/fanProgress';
import { RESOURCE_ICON } from '../assets';
import { rankFor, clubPower } from '../ranks';
import { RankCrest, Sheet, Btn } from './ui';

// Interruptions start at the currently displayed value, avoiding a counter jump.
function useRollup(target: number) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = target; setShown(target); return;
    }
    const from = current.current, start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 450);
      current.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setShown(Math.round(current.current));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
const format = (n: number) => Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
interface Props { gameState: GameState; onRally?: () => void; onOpenRanks?: () => void; onOpenClub: () => void; }

export function TopHUD({ gameState: gs, onRally, onOpenRanks, onOpenClub }: Props) {
  const [rallyOpen, setRallyOpen] = useState(false);
  useEffect(() => {
    if (!rallyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setRallyOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [rallyOpen]);
  const { resources: r } = gs;
  const coins = useRollup(r.COINS), fans = useRollup(r.FANS), crowns = useRollup(r.GEMS);
  const { rank, next, progress } = rankFor(gs.trophies ?? 0);
  const rally = rallyPreview(gs);
  const resources = [
    { name: 'Energy', value: r.ENERGY, raw: r.ENERGY, icon: <img src={RESOURCE_ICON.energy} alt="" />, color: '#70caff', hint: 'Used for drills and away games. Refills over time.' },
    { name: 'Coins', value: coins, raw: r.COINS, icon: <Coins size={19} />, color: '#ffd16d', id: 'hud-coins', hint: 'Gate receipts for facilities, equipment and player upgrades.' },
    { name: 'Fans', value: fans, raw: r.FANS, icon: <Users size={19} />, color: '#ff9fbd', hint: 'Your available home crowd. Rally costs Fans; earned campus stages stay unlocked.' },
    { name: 'Crowns', value: crowns, raw: r.GEMS, icon: <Crown size={19} />, color: '#c9adff', hint: 'Scout Searches, extra builders and finishing upgrades.' },
  ];
  return <><header className="fhq-hud">
    <div className="fhq-club-identity">
      <button className="fhq-club-button" onClick={onOpenClub} aria-label={`Open ${gs.teamName} club overview`}>
        <ClubCrest name={gs.teamName} />
        <span><small>FOOTBALL HEADQUARTERS</small><strong>{gs.teamName}{gs.campaign?.claimed?.includes(12) ? ' · Champions' : ''}</strong></span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      <button className="fhq-rank-line" onClick={onOpenRanks} title={next ? `${next.min - gs.trophies} trophies to ${next.name}` : 'Top of the ladder'}>
        <RankCrest rank={rank} size={20} /><span>{rank.name}</span><Trophy size={13} /><b>{gs.trophies}</b>
        <span className="fhq-rank-progress" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} /></span>
        <span className="fhq-power"><Zap size={13} />{format(clubPower(gs))}</span>
      </button>
    </div>
    <div className="fhq-resources" aria-label="Club resources">
      {resources.map(item => <div key={item.name} id={item.id} className="fhq-resource" style={{ '--resource-color': item.color } as React.CSSProperties} title={`${item.raw.toLocaleString()} ${item.name}. ${item.hint}`}>
        <span className="fhq-resource-icon" aria-hidden="true">{item.icon}</span>
        <span><small>{item.name}</small><strong>{format(item.value)}{item.name === 'Energy' && <em className="fhq-cap" aria-label="of 100">/100</em>}</strong></span>
        {item.name === 'Energy' && onRally && <button className="fhq-rally" data-tour="rally" onClick={() => setRallyOpen(true)} aria-label={rally.energyGain > 0 ? `Preview rally: ${rally.fanCost} Fans for ${rally.energyGain} Energy` : 'Preview rally: energy already full'} title={rally.energyGain > 0 ? `${rally.fanCost} Fans → +${rally.energyGain} Energy` : 'Energy already full'}><Megaphone size={16} /></button>}
      </div>)}
    </div>
    </header>
    {rallyOpen && <Sheet title="Rally the fans" icon={<Megaphone size={22} />} subtitle="Refill energy for your next game." onClose={() => setRallyOpen(false)} maxWidth="max-w-md">
      <div className="p-5 space-y-4 text-sm text-slate-300">
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-900 p-4">
          <dt>Fans spent</dt><dd className="text-right font-bold text-rose-300">{rally.fanCost}</dd>
          <dt>Energy restored</dt><dd className="text-right font-bold text-sky-300">+{rally.energyGain}</dd>
          <dt>Energy after rally</dt><dd className="text-right font-bold text-white">{r.ENERGY + rally.energyGain} / 100</dd>
          <dt>Fans remaining</dt><dd className="text-right font-bold text-white">{Math.max(0, r.FANS - rally.fanCost).toLocaleString()}</dd>
        </dl>
        <p>Earned campus stages stay unlocked. Your available Fans—and their current crowd bonuses—decrease by {rally.fanCost}.</p>
        {!rally.canRally && <p role="status" className="text-amber-300">{rally.energyGain === 0 ? 'Your energy is already full.' : `You need ${(rally.fanCost - r.FANS).toLocaleString()} more Fans to rally.`}</p>}
        <Btn size="lg" disabled={!rally.canRally} onClick={() => { if (!rally.canRally) return; onRally?.(); setRallyOpen(false); }}>Rally · {rally.fanCost} Fans</Btn>
      </div>
    </Sheet>}
  </>;
}
