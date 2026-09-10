import { BuildingArt, BuildingSprite } from './BuildingArt';
import { DefenseDraftPreview } from './DefenseDraftPreview';
import React, { useMemo, useRef, useState } from 'react';
import { BuildingType, type GameState } from '../types';
import { defenseSprite } from '../assets';
import { FORMATION_ORDER, formationDef, formationUnlocked, type FormationKey } from '../fixedBase';
import { campusLayoutForState, campusLayoutId, templateCampusLayout, validateCampusLayout, type CampusLayout } from '../game/campusLayout';
import { campusTileIntent, editorNeighbor, campusPlacementMessage, campusItems, campusItemTiles, editorProject, editorTile, moveCampusItem } from '../game/campusEditor';
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
  const [showStrategy, setShowStrategy] = useState(false);
  const [discardArmed,setDiscardArmed]=useState(false);
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
  const nudge = (dx:number,dy:number) => setCandidate(p => ({x:Math.max(0,Math.min(10-item.size,(p?.x??item.gridX)+dx)),y:Math.max(0,Math.min(10-item.size,(p?.y??item.gridY)+dy))}));
  const apply = async () => {
    if (busy || blocked || !dirty || !draftValidation.valid || candidate) return;
    setBusy(true);
    try { const result=await onApply(draft);setMessage(result.message);if(result.ok){savedId.current=campusLayoutId(draft);setHistory([draft]);setIndex(0);setDiscardArmed(false);} }
    catch {setMessage('The layout was not confirmed. Your draft is still here. Check your connection and Settings before retrying.');}
    finally {setBusy(false);}
  };
  const requestClose=()=>{if(busy)return;if(dirty||candidate)setDiscardArmed(true);else onClose();};
  const tapTile=(x:number,y:number)=>{if(busy)return;setFocusTile(y*10+x);const intent=campusTileIntent(draft,x,y);if('select' in intent)select(intent.select);else setCandidate(intent.destination);};
  const displayedItems = campusItems(preview);
  const selectedTiles = new Set(campusItemTiles(displayedItems.find(p=>p.key===item.key)!).map(p=>p.join(',')));
  return <Sheet title="Edit campus" subtitle="Arrange your facilities and defenses" onClose={requestClose} maxWidth="max-w-5xl" footer={<div className="flex flex-wrap gap-2">
    {discardArmed?<><p role="alert" className="w-full text-sm text-amber-200">Discard this unsaved layout? Your saved campus will stay unchanged.</p><Btn variant="secondary" onClick={()=>setDiscardArmed(false)}>Keep editing</Btn><Btn variant="secondary" onClick={onClose}>Discard draft</Btn></>:<Btn variant="secondary" disabled={busy} onClick={requestClose}>Cancel</Btn>}
    <Btn disabled={busy||blocked||!dirty||!draftValidation.valid||!!candidate} onClick={()=>void apply()}>{busy?'Confirming…':'Apply layout'}</Btn>
    <Btn variant="secondary" disabled={busy||dirty||!!candidate||blocked} onClick={onTest}>Test saved defense</Btn>
  </div>}>
    <div className="p-4 space-y-4">
      <p className="text-sm text-slate-300">Tap a building or machine to select it. Tap open ground to preview a move, then choose Place here.</p>
      <div className="grid gap-3">
        <label className="text-sm text-slate-300">Item to move<select aria-label="Item to move" className="block w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 p-3 text-white" value={item.key} onChange={e=>select(e.target.value)} disabled={busy}>{items.map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label>

      </div>
      <div className="flex flex-wrap gap-2">
        <Btn variant="secondary" disabled={busy||index===0} onClick={()=>{setIndex(i=>i-1);setCandidate(null);}}>Undo</Btn>
        <Btn variant="secondary" disabled={busy||index===history.length-1} onClick={()=>{setIndex(i=>i+1);setCandidate(null);}}>Redo</Btn>

        <Btn variant="secondary" onClick={()=>setZoom(z=>z===1?1.6:1)}>{zoom===1?'Zoom in':'Fit campus'}</Btn>
      </div>
      <div className="rounded-xl border border-slate-600 overflow-auto bg-emerald-950" aria-label="Campus placement map. Scroll to pan when zoomed." style={{maxHeight:480,touchAction:'pan-x pan-y'}}>
        <svg ref={grid} role="group" aria-label="Campus tiles" viewBox="0 0 1000 590" style={{width:`${zoom*100}%`,minWidth:zoom===1?undefined:640,display:'block'}}>
          {Array.from({length:100},(_,i)=>{const x=i%10,y=Math.floor(i/10);const occupants=displayedItems.filter(p=>campusItemTiles(p).some(([gx,gy])=>gx===x&&gy===y));const active=selectedTiles.has(`${x},${y}`);return <polygon key={i} role="button" aria-label={`Column ${x+1}, row ${y+1}${occupants.length?` · ${occupants.map(p=>p.name).join(', ')}`:' · open'}`} aria-pressed={candidate?.x===x&&candidate?.y===y} tabIndex={focusTile===i?0:-1} data-campus-tile={i} points={editorTile(x,y)} fill={active?(validation.valid?'#0e7490':'#991b1b'):x===0||y===0||x===9||y===9?'#14362b':(x+y)%2?'#285c3d':'#306849'} stroke={focusTile===i?'#fef08a':'#789d87'} strokeWidth={focusTile===i?3:1} className="cursor-pointer focus:outline-none" onFocus={()=>setFocusTile(i)} onClick={()=>tapTile(x,y)} onKeyDown={e=>{const delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-10,ArrowDown:10} as Record<string,number>)[e.key];if(delta!==undefined){e.preventDefault();const next=editorNeighbor(i,e.key);setFocusTile(next);grid.current?.querySelector<SVGElement>(`[data-campus-tile="${next}"]`)?.focus();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();tapTile(x,y);}}}/>;})}
          {displayedItems.sort((a,b)=>a.gridX+a.gridY-b.gridX-b.gridY).map(p=>{const point=editorProject(p.gridX+p.size/2,p.gridY+p.size/2);const facility=preview.facilities.find(f=>`facility:${f.id}`===p.key);const building=facility&&state.buildings.find(b=>b.id===facility.id);return <g key={p.key} role="button" aria-label={`Select ${p.name}`} tabIndex={-1} className="cursor-pointer" onClick={e=>{e.stopPropagation();if(!busy)select(p.key);}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();select(p.key);}}}>
            {building?<foreignObject x={point.x-64} y={point.y-112} width={128} height={128}><BuildingArt type={building.type} level={building.level} className="w-full" /></foreignObject>:p.key.startsWith('slot:')?<foreignObject x={point.x-35} y={point.y-62} width={70} height={70} opacity={(state.defenseSlots[p.key.split(':')[1]]??0)>0?1:.4}><BuildingSprite src={defenseSprite(preview.slots.find(slot=>`slot:${slot.id}`===p.key)!.kind,Math.max(1,state.defenseSlots[p.key.split(':')[1]]??0))} /></foreignObject>:<><circle cx={point.x} cy={point.y} r={p.key.startsWith('gate')?12:9} fill={p.key.startsWith('gate')?'#fbbf24':p.key.startsWith('wall')?'#cbd5e1':'#fb923c'}/><text x={point.x} y={point.y+4} textAnchor="middle" fontSize={12} fill="#0f172a">{p.key.startsWith('wall')?'':p.key==='bus'?'B':p.key.startsWith('gate')?'G':p.key.split(':')[1]}</text></>}
            {p.key===item.key&&<text x={point.x} y={point.y+25} textAnchor="middle" fill="white" stroke="#052e16" strokeWidth={4} paintOrder="stroke" fontSize={18}>{p.name}</text>}
          </g>;})}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Precise placement">
        <span className="text-sm text-slate-200">Column {(candidate?.x??item.gridX)+1}, row {(candidate?.y??item.gridY)+1}</span>
        {([[-1,0,'Left'],[1,0,'Right'],[0,-1,'Up'],[0,1,'Down']] as const).map(([dx,dy,label])=><Btn key={label} variant="secondary" disabled={busy} onClick={()=>nudge(dx,dy)}>{label}</Btn>)}
        <Btn disabled={!candidate||busy||!validation.valid} onClick={()=>commit(preview)}>Place here</Btn>
        {candidate&&<Btn variant="ghost" disabled={busy} onClick={()=>setCandidate(null)}>Clear preview</Btn>}
      </div>
      <details className="rounded-xl border border-slate-600 p-3 text-sm text-slate-300"><summary className="min-h-7 cursor-pointer font-bold text-white">Templates & layout guide</summary><div className="mt-3 space-y-3">
        <label className="text-sm text-slate-300">Formation template<select aria-label="Formation template" className="block w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 p-3 text-white" value={draft.formation} disabled={busy} onChange={e=>commit(templateCampusLayout(e.target.value as FormationKey,state.buildings))}>{FORMATION_ORDER.map(key=><option key={key} value={key} disabled={!formationUnlocked(key,stadiumLevel)}>{formationDef(key).name}{formationUnlocked(key,stadiumLevel)?'':` · Stadium level ${formationDef(key).unlockStadium}`}</option>)}</select></label><Btn variant="secondary" disabled={busy} onClick={()=>commit(templateCampusLayout(draft.formation,state.buildings))}>Reset template</Btn><p>Facilities need four tiles. Gates must stay open. Dim machines reserve slots you have not installed yet. Changing templates replaces this draft; Undo brings it back.</p><p>This is your competitive defense layout. Home-campus decorations are cosmetic.</p></div></details>
      <details onToggle={event => setShowStrategy(event.currentTarget.open)} className="rounded-xl border border-slate-600">
        <summary className="min-h-11 cursor-pointer px-3 py-3 font-bold text-white">Preview defense coverage and gate assignments</summary>
        {showStrategy && (validation.valid ? <DefenseDraftPreview state={state} layout={preview} /> : <p className="p-3 text-sm text-amber-300">Fix the placement issues below to preview this defense.</p>)}
      </details>
      <div role="status" aria-live="polite" className="text-sm rounded-lg bg-slate-800 p-3 text-slate-200">
        {validation.valid?<p>{candidate?'This placement is valid. Place here to update your draft.':message}</p>:<><p className="font-bold text-rose-300">Fix these placement issues before applying:</p><ul className="list-disc pl-5 mt-2">{[...new Set(validation.issues.map(i=>campusPlacementMessage(i.message)))].map(text=><li key={text}>{text}</li>)}</ul></>}
        {blocked&&<p className="mt-2 text-amber-200">Saving is unavailable while your club is connecting or has an unconfirmed operation. Your draft is safe here; check Settings for recovery.</p>}
        <p className="mt-2 text-slate-400">Your placement appears under View → Saved arrangement and in defense tests. Campus overview keeps departments spaced for easier navigation. Unprotected rival publishing still uses formation templates; Online protection uses the full saved layout.</p>
      </div>
    </div>
  </Sheet>;
}
