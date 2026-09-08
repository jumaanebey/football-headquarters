import React from 'react';
import { Users, Star, Trophy, Shield, Goal } from 'lucide-react';

interface Props {
  rosterOpen: boolean; heroesOpen: boolean; ranksOpen: boolean; defenseOpen: boolean;
  unseenDefenses: number;
  onRoster: () => void; onHeroes: () => void; onGameDay: () => void;
  onRanks: () => void; onDefense: () => void;
}

/** One navigation contract for pointer, touch, and keyboard players. */
export function GameNavigation(p: Props) {
  const items = [
    { label: 'Roster', icon: Users, action: p.onRoster, open: p.rosterOpen, tour: 'coach' },
    { label: 'Heroes', icon: Star, action: p.onHeroes, open: p.heroesOpen },
    { label: 'Game Day', icon: Goal, action: p.onGameDay, primary: true, tour: 'trophy' },
    { label: 'Ranks', icon: Trophy, action: p.onRanks, open: p.ranksOpen },
    { label: 'Defense', icon: Shield, action: p.onDefense, open: p.defenseOpen, tour: 'design' },
  ];
  return <nav className="fhq-navigation" aria-label="Club navigation">
    {items.map(({ label, icon: Icon, action, open, primary, tour }) =>
      <button key={label} type="button" onClick={action} data-tour={tour}
        className={`fhq-nav-item ${primary ? 'fhq-nav-play' : ''}`} aria-pressed={primary ? undefined : open}>
        <Icon size={23} aria-hidden="true" /><span>{label}</span>
        {label === 'Defense' && p.unseenDefenses > 0 && <span className="fhq-nav-badge" aria-label={`${p.unseenDefenses} unread defense reports`}>{p.unseenDefenses}</span>}
      </button>)}
  </nav>;
}
