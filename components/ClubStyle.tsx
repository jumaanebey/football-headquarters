import React, { useEffect, useState } from 'react';
import { CLUB_STYLES, clubStyle, clubInitials } from '../game/clubStyle';
export function useClubStyle(name:string) {
  const [,refresh]=useState(0);
  useEffect(()=>{ const update=()=>refresh(n=>n+1); window.addEventListener('fhq-style',update); window.addEventListener('storage',update); return ()=>{window.removeEventListener('fhq-style',update);window.removeEventListener('storage',update);}; },[]);
  return clubStyle(name);
}
export function ClubCrest({name}:{name:string}) { const style=useClubStyle(name); return <span aria-hidden="true" className="fhq-team-crest" style={{background:style.primary,color:style.secondary,borderColor:style.secondary}}>{clubInitials(name)}</span>; }
export function ClubStylePicker({name}:{name:string}) {
  const style=useClubStyle(name), [error,setError]=useState(false);
  return <section className="rounded-xl border border-slate-700 p-3"><h3 className="font-bold text-white">Club colors</h3><p className="my-2 text-xs text-slate-300">Crest and home end zone · saved on this device. Uniform skins are still to come.</p><div className="grid grid-cols-2 gap-2">{CLUB_STYLES.map(s=><button key={s.id} aria-pressed={style.id===s.id} onClick={()=>{try{localStorage.setItem(`fhq-style:${name}`,s.id);setError(false);window.dispatchEvent(new Event('fhq-style'));}catch{setError(true);}}} className="rounded-lg border-2 px-2 py-2 text-sm font-bold" style={{background:s.primary,color:s.secondary,borderColor:style.id===s.id?'white':'transparent'}}>{s.name}</button>)}</div>{error&&<p role="status">This browser could not save your color choice.</p>}</section>;
}
