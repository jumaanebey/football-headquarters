import React, { useMemo, useRef, useState } from 'react';
import { BuildingType, type GameState } from '../types';
import { buildingSprite } from '../assets';
import { FORMATION_ORDER, formationDef, formationUnlocked, type FormationKey } from '../fixedBase';
import { campusLayoutForState, campusLayoutId, templateCampusLayout, validateCampusLayout, type CampusLayout } from '../game/campusLayout';
import { campusPlacementMessage, campusItems, campusItemTiles, editorProject, editorTile, moveCampusItem } from '../game/campusEditor';
import { Sheet, Btn } from './ui';

export function CampusEditor({ state, blocked, onApply, onClose, onTest }: {
  state: GameState; blocked: boolean; onApply: (layout: CampusLayout) => Promise<{ok:boolean;message:string}>; onClose: () => void; onTest: () => void;
}) {
  const [history, setHistory] = useState(() => [campusLayoutForState(state)]);
  const [index, setIndex] = useState(0);
  const savedId = useRef(campusLayoutId(history[0]));
  const draft = history[index];
  const items = useMemo(() => campusItems(draft), [draft]);
  const [selected, setSelected] = useState(items[0].key);
  const item = items.find(p => p.key === selected) ?? items[0];
  const [candidate, setCandidate] = useState<{x:number;y:number} | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Your changes stay in this draft until you apply them.');
  const [focusTile, setFocusTile] = useState(11);
  const grid = useRef<SVGSVGElement>(null);
  const preview = candidate ? moveCampusItem(draft, item.key, candidate.x, candidate.y) : draft;
  const validation = useMemo(() => validateCampusLayout(preview, state.buildings), [preview, state.buildings]);
  const draftValidation = useMemo(() => validateCampusLayout(draft, state.buildings), [draft, state.buildings]);
  const dirty = campusLayoutId(draft) !== savedId.current;
  const stadiumLevel = state.buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
  const commit = (layout: CampusLayout) => { setHistory(h => [...h.slice(0,index+1),layout]);setIndex(index+1);setCandidate(null);setMessage('Draft updated. Apply when you are ready.'); };
  const select = (key:string) => {setSelected(key);setCandidate(null);};
  const nudge = (dx:number,dy:number) => setCandidate(p => ({x:Math.max(0,Math.min(9,(p?.x??item.gridX)+dx)),y:Math.max(0,Math.min(9,(p?.y??item.gridY)+dy))}));
  const apply = async () => {
    if (busy || blocked || !dirty || !draftValidation.valid || candidate) return;
    setBusy(true);
    try { const result=await onApply(draft);setMessage(result.message);if(result.ok){savedId.current=campusLayoutId(draft);setHistory([draft]);setIndex(0);} }
    catch {setMessage('The layout was not confirmed. Your draft is still here. Check your connection and Settings before retrying.');}
    finally {setBusy(false);}
  };
  const displayedItems = campusItems(preview);
  const selectedTiles = new Set(campusItemTiles(displayedItems.find(p=>p.key===item.key)!).map(p=>p.join(',')));
  return <Sheet title="Edit campus" subtitle="Arrange your facilities and defenses" onClose={()=>{if(!busy)onClose();}} maxWidth="max-w-5xl" footer={<div className="flex flex-wrap gap-2">
    <Btn variant="secondary" disabled={busy} onClick={onClose}>Cancel</Btn>
    <Btn disabled={busy||blocked||!dirty||!draftValidation.valid||!!candidate} onClick={()=>void apply()}>{busy?'Confirming…':'Apply layout'}</Btn>
    <Btn variant="secondary" disabled={busy||dirty||!!candidate||blocked} onClick={onTest}>Test saved defense</Btn>
  </div>}>
    <div className="p-4 space-y-4">
      <p className="text-sm text-slate-300">Select an item, tap a destination, then choose Place here. Facilities use four tiles. Keep gates open. Walls and equipment shown here reserve their positions, including slots you have not bought yet.</p>
      <p className="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">This is your competitive defense layout. Home-campus decorations are cosmetic; Test saved defense shows the walls, bus, gates and equipment your saved layout uses in play.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">Item to move<select aria-label="Item to move" className="block w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 p-3 text-white" value={item.key} onChange={e=>select(e.target.value)} disabled={busy}>{items.map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
        <label className="text-sm text-slate-300">Formation template<select aria-label="Formation template" className="block w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 p-3 text-white" value={draft.formation} disabled={busy} onChange={e=>commit(templateCampusLayout(e.target.value as FormationKey,state.buildings))}>{FORMATION_ORDER.map(key=><option key={key} value={key} disabled={!formationUnlocked(key,stadiumLevel)}>{formationDef(key).name}{formationUnlocked(key,stadiumLevel)?'':` · Stadium level ${formationDef(key).unlockStadium}`}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn variant="secondary" disabled={busy||index===0} onClick={()=>{setIndex(i=>i-1);setCandidate(null);}}>Undo</Btn>
        <Btn variant="secondary" disabled={busy||index===history.length-1} onClick={()=>{setIndex(i=>i+1);setCandidate(null);}}>Redo</Btn>
        <Btn variant="secondary" disabled={busy} onClick={()=>commit(templateCampusLayout(draft.formation,state.buildings))}>Reset template</Btn>
        <Btn variant="secondary" onClick={()=>setZoom(z=>z===1?1.6:1)}>{zoom===1?'Zoom in':'Fit campus'}</Btn>
      </div>
      <div className="rounded-xl border border-slate-600 overflow-auto bg-emerald-950" aria-label="Campus placement map. Scroll to pan when zoomed." style={{maxHeight:480,touchAction:'pan-x pan-y'}}>
        <svg ref={grid} role="group" aria-label="Campus tiles" viewBox="0 0 1000 590" style={{width:`${zoom*100}%`,minWidth:zoom===1?undefined:640,display:'block'}}>
          {Array.from({length:100},(_,i)=>{const x=i%10,y=Math.floor(i/10);const occupants=displayedItems.filter(p=>campusItemTiles(p).some(([gx,gy])=>gx===x&&gy===y));const active=selectedTiles.has(`${x},${y}`);return <polygon key={i} role="button" aria-label={`Column ${x+1}, row ${y+1}${occupants.length?` · ${occupants.map(p=>p.name).join(', ')}`:' · open'}`} aria-pressed={candidate?.x===x&&candidate?.y===y} tabIndex={focusTile===i?0:-1} data-campus-tile={i} points={editorTile(x,y)} fill={active?(validation.valid?'#0e7490':'#991b1b'):x===0||y===0||x===9||y===9?'#14362b':(x+y)%2?'#285c3d':'#306849'} stroke={focusTile===i?'#fef08a':'#789d87'} strokeWidth={focusTile===i?3:1} className="cursor-pointer focus:outline-none" onFocus={()=>setFocusTile(i)} onClick={()=>{if(!busy){setFocusTile(i);setCandidate({x,y});}}} onKeyDown={e=>{const delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-10,ArrowDown:10} as Record<string,number>)[e.key];if(delta!==undefined){e.preventDefault();const next=Math.max(0,Math.min(99,i+delta));setFocusTile(next);grid.current?.querySelector<SVGElement>(`[data-campus-tile="${next}"]`)?.focus();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)setCandidate({x,y});}}}/>;})}
          {displayedItems.sort((a,b)=>a.gridX+a.gridY-b.gridX-b.gridY).map(p=>{const point=editorProject(p.gridX+p.size/2,p.gridY+p.size/2);const facility=preview.facilities.find(f=>`facility:${f.id}`===p.key);const building=facility&&state.buildings.find(b=>b.id===facility.id);return <g key={p.key} pointerEvents="none" aria-hidden="true">
            {building?<image href={buildingSprite(building.type,building.level)} x={point.x-60} y={point.y-92} width={120} height={112}/>:<><circle cx={point.x} cy={point.y} r={p.key.startsWith('gate')?12:9} fill={p.key.startsWith('gate')?'#fbbf24':p.key.startsWith('wall')?'#cbd5e1':'#fb923c'}/><text x={point.x} y={point.y+4} textAnchor="middle" fontSize={12} fill="#0f172a">{p.key.startsWith('wall')?'':p.key==='bus'?'B':p.key.startsWith('gate')?'G':p.key.split(':')[1]}</text></>}
            {p.key===item.key&&<text x={point.x} y={point.y+25} textAnchor="middle" fill="white" stroke="#052e16" strokeWidth={4} paintOrder="stroke" fontSize={18}>{p.name}</text>}
          </g>;})}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Precise placement">
        <span className="text-sm text-slate-200">Column {(candidate?.x??item.gridX)+1}, row {(candidate?.y??item.gridY)+1}</span>
        {([[-1,0,'Left'],[1,0,'Right'],[0,-1,'Up'],[0,1,'Down']] as const).map(([dx,dy,label])=><Btn key={label} variant="secondary" disabled={busy} onClick={()=>nudge(dx,dy)}>{label}</Btn>)}
        <Btn disabled={!candidate||busy} onClick={()=>commit(preview)}>Place here</Btn>
        {candidate&&<Btn variant="ghost" disabled={busy} onClick={()=>setCandidate(null)}>Clear preview</Btn>}
      </div>
      <div role="status" aria-live="polite" className="text-sm rounded-lg bg-slate-800 p-3 text-slate-200">
        {validation.valid?<p>{candidate?'This placement is valid. Place here to update your draft.':message}</p>:<><p className="font-bold text-rose-300">Fix these placement issues before applying:</p><ul className="list-disc pl-5 mt-2">{[...new Set(validation.issues.map(i=>campusPlacementMessage(i.message)))].map(text=><li key={text}>{text}</li>)}</ul></>}
        {blocked&&<p className="mt-2 text-amber-200">Saving is unavailable while your club is connecting or has an unconfirmed operation. Your draft is safe here; check Settings for recovery.</p>}
        <p className="mt-2 text-slate-400">{state.campusLayout?'Your saved placement is used on campus and in defense tests.':'Applying a layout connects the campus view to these defensive positions.'} Unprotected rival publishing still uses formation templates; Online protection uses the full saved layout.</p>
      </div>
    </div>
  </Sheet>;
}
