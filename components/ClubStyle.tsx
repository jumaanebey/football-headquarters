import React, { useEffect, useState } from 'react';
import { CLUB_STYLES, clubStyle, clubInitials } from '../game/clubStyle';
type Style = typeof CLUB_STYLES[number];
export function useClubStyle(name: string) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    window.addEventListener('fhq-style', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('fhq-style', update); window.removeEventListener('storage', update); };
  }, []);
  return clubStyle(name);
}

/** Original vector marks: no image requests, masks, or shared SVG ids. */
export function ClubEmblem({ name, style, size = 44 }: { name: string; style: Style; size?: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
    <path d="M8 7H56V34Q56 49 32 59Q8 49 8 34Z" fill={style.primary} stroke={style.secondary} strokeWidth="3" />
    <g fill="none" stroke={style.secondary} strokeWidth="3" strokeLinejoin="round">
      {style.id === 'harbor' && <><path d="M15 22L24 18L32 22L40 18L49 22M15 29L24 25L32 29L40 25L49 29" /><path d="M32 11V17" /></>}
      {style.id === 'redline' && <><path d="M17 15L29 25L41 15M23 15L35 25L47 15" /><path d="M16 30H48" /></>}
      {style.id === 'evergreen' && <><path d="M32 11L21 23H26L19 30H45L38 23H43Z" /><path d="M32 26V33" /></>}
      {style.id === 'violet' && <><path d="M34 10L22 23H31L28 32L43 18H34Z" /><path d="M16 18V26M48 24V32" /></>}
    </g>
    <text x="32" y="47" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="900" fontSize="16" fill={style.secondary}>{clubInitials(name)}</text>
  </svg>;
}
export function ClubCrest({ name }: { name: string }) {
  const style = useClubStyle(name);
  return <span className="fhq-team-crest" style={{ background: 'transparent', border: 0 }}><ClubEmblem name={name} style={style} size={34} /></span>;
}
export function ClubStylePicker({ name }: { name: string }) {
  const saved = useClubStyle(name);
  const [previewId, setPreviewId] = useState<Style['id']>(saved.id);
  const [message, setMessage] = useState('');
  useEffect(() => { setPreviewId(saved.id); }, [name, saved.id]);
  useEffect(() => { setMessage(''); }, [name]);
  const preview = CLUB_STYLES.find(s => s.id === previewId)!;
  const changed = preview.id !== saved.id;
  const apply = () => {
    try {
      localStorage.setItem(`fhq-style:${name}`, preview.id);
      window.dispatchEvent(new Event('fhq-style'));
      setMessage(`${preview.name} applied on this device.`);
    } catch { setMessage('Could not save. Your current club colors are unchanged.'); }
  };
  return <section className="rounded-xl border border-slate-700 p-3" aria-label="Club identity">
    <h3 className="font-bold text-white">Club identity</h3>
    <p className="my-2 text-xs text-slate-300">Preview your crest and field colors. Apply when ready.</p>
    <div className="mb-3 flex items-center gap-3 rounded-lg p-3" style={{ background: preview.primary, color: preview.secondary }}>
      <ClubEmblem name={name} style={preview} size={64} />
      <div className="min-w-0"><p className="break-words font-black">{name}</p><p className="text-xs">{preview.name} · {changed ? 'Preview' : 'Current style'}</p></div>
    </div>
    <div aria-label="Campus field color preview" className="mb-3 flex h-16 overflow-hidden rounded-lg border border-white/20">
      <div className="flex w-1/4 items-center justify-center text-xs font-black" style={{ background: preview.primary, color: preview.secondary }}>HOME</div>
      <div className="relative flex flex-1 items-center justify-center bg-emerald-900" style={{ backgroundImage: 'repeating-linear-gradient(90deg,transparent 0,transparent calc(20% - 1px),#ffffff55 calc(20% - 1px),#ffffff55 20%)' }}><span className="rounded-full border border-white/50 px-3 py-1 text-xs font-black text-white">50</span></div>
      <div className="flex w-1/4 items-center justify-center text-xs font-black" style={{ background: preview.secondary, color: preview.primary }}>AWAY</div>
    </div>
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Preview a club style">{CLUB_STYLES.map(s => <button key={s.id} aria-pressed={preview.id === s.id} onClick={() => { setPreviewId(s.id); setMessage(''); }} className="flex min-h-14 items-center gap-2 rounded-lg border-2 p-2 text-left text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" style={{ background: s.primary, color: s.secondary, borderColor: preview.id === s.id ? 'white' : 'transparent' }}><ClubEmblem name={name} style={s} size={32} /><span>{s.name}{saved.id === s.id && <span className="block text-[10px]">Applied</span>}</span></button>)}</div>
    <div className="mt-3 flex gap-2"><button disabled={!changed} onClick={apply} className="min-h-11 flex-1 rounded-lg bg-white px-3 font-bold text-slate-950 disabled:opacity-40">Apply style</button>{changed && <button onClick={() => { setPreviewId(saved.id); setMessage(''); }} className="min-h-11 rounded-lg border border-slate-500 px-3 text-sm text-white">Cancel</button>}</div>
    <p role="status" className="mt-2 text-xs text-slate-300">{message || 'Saved on this device. Changes crest and field paint; player uniforms stay the same.'}</p>
  </section>;
}
