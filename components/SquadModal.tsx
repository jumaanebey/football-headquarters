import { unitPower } from '../battle';
import { playerGrowth } from '../game/progression/playerGrowth';

import React, { useState } from 'react';
import { Player, UnitGroup, GameState } from '../types';
import { TENDENCIES, TendencyKey } from '../constants';
import { unitPlayerSprite } from '../assets';
import { candidateOvr } from '../recruiting';
import { Shield, Target, Users, Zap, Dumbbell } from 'lucide-react';
import { Sheet } from './ui';

interface Props {
  roster: Player[];
  club: GameState;
  blocked: boolean;
  playerFilter: UnitGroup | null;
  onFilterChange: (unit: UnitGroup | null) => void;
  onClose: () => void;
  onCutPlayer?: (id: string) => void;
  onScout?: () => void;
  onOpenWeightRoom: (playerId?:string)=>void;
}


// Roster browsing and development share the Weight Room destination.
const GROUPS: { unit: UnitGroup; title: string; subtitle: string; icon: React.ReactNode; ring: string }[] = [
  { unit: UnitGroup.OFFENSE_LINE,      title: 'The Trenches',    subtitle: 'OL',        icon: <Shield size={13} />, ring: '#ef4444' },
  { unit: UnitGroup.OFFENSE_SKILL,     title: 'Skill Positions', subtitle: 'QB·WR·RB',  icon: <Zap size={13} />,    ring: '#f97316' },
  { unit: UnitGroup.DEFENSE_LINE,      title: 'Front Seven',     subtitle: 'DL·LB',     icon: <Dumbbell size={13} />, ring: '#3b82f6' },
  { unit: UnitGroup.DEFENSE_SECONDARY, title: 'No Fly Zone',     subtitle: 'CB·S',      icon: <Target size={13} />, ring: '#6366f1' },
];

export const SquadModal: React.FC<Props> = ({ roster, club, blocked, playerFilter, onFilterChange: setPlayerFilter, onClose, onCutPlayer, onScout, onOpenWeightRoom }) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('power');
  const [cutArmed, setCutArmed] = useState<string | null>(null); // two-tap confirm

  const shownPlayers = roster.filter(p => (!playerFilter || p.unit === playerFilter) && `${p.name} ${p.role} ${p.rarity}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b) => (sort === 'power' ? unitPower(b)-unitPower(a) : sort === 'growth' ? a.level-b.level : candidateOvr(b)-candidateOvr(a)) || a.name.localeCompare(b.name));

  return (
    <Sheet
      title="Your roster"
      icon={<Users className="text-sky-400" size={22} />}
      subtitle={`${roster.length} players · ${Math.round(roster.reduce((sum, p) => sum + candidateOvr(p), 0) / Math.max(1, roster.length))} team OVR`}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="p-4 border-b border-slate-700 flex gap-2"><button onClick={()=>onOpenWeightRoom()} className="flex-1 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white">Enter Weight Room</button><button onClick={onScout} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Scout</button></div>
      {blocked && <p role="status" className="mx-4 mt-3 rounded-xl bg-blue-950 p-3 text-sm text-blue-200">Confirming your club change…</p>}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-300">Find a player<input aria-label="Find a player" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, role or rarity" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-white" /></label><label className="text-xs text-slate-300">Sort roster<select aria-label="Sort roster" value={sort} onChange={e=>setSort(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-white"><option value="power">Battle power</option><option value="ovr">Overall rating</option><option value="growth">Lowest level</option></select></label></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => setPlayerFilter(null)} aria-pressed={playerFilter === null} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white">All players</button>{GROUPS.map(g => <button key={g.unit} aria-pressed={playerFilter === g.unit} onClick={() => setPlayerFilter(g.unit)} className={`rounded-lg border px-3 py-2 text-sm ${playerFilter === g.unit ? 'border-orange-400 bg-orange-500/20 text-orange-200' : 'border-slate-700 text-slate-300'}`}>{g.title}</button>)}</div>
        <p className="text-xs text-slate-400">{shownPlayers.length} of {roster.length} players · Battle power includes role, rarity and training.</p>
        {shownPlayers.length === 0 && <div role="status" className="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">No players match this view.<button onClick={()=>{setSearch('');setPlayerFilter(null);}} className="mt-2 block min-h-11 text-sky-300 font-bold">Show all players</button></div>}
        <div className="grid gap-3 sm:grid-cols-2">{shownPlayers.map(p => <article key={p.id} className="rounded-2xl border border-slate-700 bg-slate-800/60 overflow-hidden">
          <button aria-expanded={selectedPlayer === p.id} onClick={() => {setSelectedPlayer(selectedPlayer === p.id ? null : p.id);setCutArmed(null);}} className="w-full flex items-center gap-3 p-4 text-left">
            <img src={unitPlayerSprite(p.unit)} alt="" className="w-14 h-16 object-contain" />
            <span className="flex-1 min-w-0"><strong className="block text-white">{p.name}</strong><span className="block text-sm text-slate-300">{p.role} · Level {p.level}</span><span className="block text-xs text-slate-400">{p.rarity} · Power {Math.round(unitPower(p))}</span><span className="text-xs text-orange-300">{selectedPlayer === p.id ? 'Close player ↑' : 'Stats & growth →'}</span></span>
            <span className="text-center text-2xl font-bold text-amber-300">{candidateOvr(p)}<small className="block text-xs text-slate-400">OVR</small></span>
          </button>
          {selectedPlayer === p.id && <div className="border-t border-slate-700 p-4 space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-center">{[['Strength',p.stats.strength],['Speed',p.stats.speed],['IQ',p.stats.iq]].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="text-lg font-bold text-white">{value}</dd></div>)}</dl>
            {TENDENCIES[p.tendency as TendencyKey] && <p className="text-sm text-slate-300">Trait · {TENDENCIES[p.tendency as TendencyKey].label}: {TENDENCIES[p.tendency as TendencyKey].desc}</p>}
            {(() => {const growth=playerGrowth(club,p.id,Date.now());return growth && <section className="rounded-xl bg-slate-900 p-3 text-sm text-slate-300"><strong className="text-white">On the field</strong><p className="mt-1">Power {Math.round(growth.combat.power)} → {Math.round(growth.nextStep.after.combat.power)} after the next collected drill.</p><p className="mt-1">Grit {Math.round(growth.combat.statline.hp)} → {Math.round(growth.nextStep.after.combat.statline.hp)} · Yardage {Math.round(growth.combat.statline.dps)} → {Math.round(growth.nextStep.after.combat.statline.dps)}</p><p className="mt-2">Growth is earned when you collect training. There is no separate XP meter.</p></section>;})()}
            <p className="text-sm text-blue-200">Collecting a completed drill for this group adds 1 level and +1 Strength, Speed and IQ to each participating player.</p>
            <button onClick={() => onOpenWeightRoom(p.id)} className="w-full rounded-lg bg-blue-600 p-3 font-bold text-white">Work out with this player</button>
            {onCutPlayer && roster.length > 6 && (cutArmed === p.id ? <div className="space-y-2"><p className="text-sm text-red-200">Release {p.name}? This frees one roster spot.</p><div className="flex gap-2"><button disabled={blocked} onClick={() => {onCutPlayer(p.id);setCutArmed(null);}} className="rounded-lg bg-red-700 px-3 py-3 text-white">Confirm release</button><button onClick={() => setCutArmed(null)} className="p-3 text-white">Keep player</button></div></div> : <button disabled={blocked} onClick={() => setCutArmed(p.id)} className="min-h-11 text-sm text-red-300">Release player</button>)}
          </div>}
        </article>)}</div>
      </div>
    </Sheet>
  );
};
