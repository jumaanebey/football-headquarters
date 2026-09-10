import React, { useEffect, useState } from 'react';

export function useReducedBattleMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function BattleCameraControls({ heroes, selected, reduced, onSelect }: {
  heroes: { id: string; name: string }[]; selected: string | null; reduced: boolean; onSelect: (id: string | null) => void;
}) {
  return <details aria-label="Battle camera" className="my-2 rounded-xl border border-slate-700 bg-slate-950/90 p-2 text-white">
    <summary className="min-h-11 cursor-pointer px-2 py-3 text-xs font-bold">Camera · {heroes.find(hero => hero.id === selected)?.name ?? 'Full field'}</summary>
    <div className="flex items-center gap-2">
    <button type="button" aria-pressed={!selected} onClick={() => onSelect(null)} className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold ${!selected ? 'bg-orange-500' : 'bg-slate-700'}`}>Full field</button>
    <label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
      {reduced ? 'Hero close-up · fixed camera' : 'Follow a hero'}
      <select aria-label={reduced ? 'Hero close-up' : 'Follow a hero'} value={selected ?? ''} onChange={event => onSelect(event.target.value || null)} className="block min-h-11 w-full bg-transparent text-sm normal-case tracking-normal text-white">
        <option value="">{heroes.length ? 'Choose hero' : 'Deploy a hero first'}</option>
        {heroes.map(hero => <option className="bg-slate-900" key={hero.id} value={hero.id}>{hero.name}</option>)}
      </select>
    </label>
    </div>
  </details>;
}
