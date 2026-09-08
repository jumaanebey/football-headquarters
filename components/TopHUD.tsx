import React, { useEffect, useRef, useState } from 'react';
import { Crown, Users, Megaphone, Trophy, ChevronRight, Zap } from 'lucide-react';
import { GameState } from '../types';
import { RALLY_CONFIG } from '../constants';
import { RESOURCE_ICON } from '../assets';
import { rankFor, clubPower } from '../ranks';
import { RankCrest } from './ui';

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
  const { resources: r } = gs;
  const coins = useRollup(r.COINS), fans = useRollup(r.FANS), crowns = useRollup(r.GEMS);
  const { rank, next, progress } = rankFor(gs.trophies ?? 0);
  const canRally = r.ENERGY < 100 && r.FANS >= RALLY_CONFIG.fanCost;
  const resources = [
    { name: 'Energy', value: r.ENERGY, raw: r.ENERGY, icon: <img src={RESOURCE_ICON.energy} alt="" />, color: '#70caff', hint: 'Used for drills and away games. Refills over time.' },
    { name: 'Coins', value: coins, raw: r.COINS, icon: <img src={RESOURCE_ICON.coins} alt="" />, color: '#ffd16d', id: 'hud-coins', hint: 'Gate receipts for facilities, equipment and player upgrades.' },
    { name: 'Fans', value: fans, raw: r.FANS, icon: <Users size={19} />, color: '#ff9fbd', hint: 'Your home crowd. Rally fans to refill energy.' },
    { name: 'Crowns', value: crowns, raw: r.GEMS, icon: <Crown size={19} />, color: '#c9adff', hint: 'Scout Searches, extra builders and finishing upgrades.' },
  ];
  return <header className="fhq-hud">
    <div className="fhq-club-identity">
      <button className="fhq-club-button" onClick={onOpenClub} aria-label={`Open ${gs.teamName} club overview`}>
        <img src="/assets/brand/app-icon.webp" width="44" height="44" alt="" />
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
        {item.name === 'Energy' && canRally && <button className="fhq-rally" data-tour="rally" onClick={onRally} aria-label={`Rally: spend ${RALLY_CONFIG.fanCost} fans to refill energy`} title={`Refill for ${RALLY_CONFIG.fanCost} fans`}><Megaphone size={16} /></button>}
      </div>)}
    </div>
  </header>;
}
