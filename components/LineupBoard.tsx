import {useEffect,useState} from 'react';
import type {GameState} from '../types';
import type {ClubAction} from '../game/authority/clubActions';
import {lineupView,lineupOf,compareLineupChange,type LineupSlotId,type LineupAssignment} from '../game/lineup';

/** A proposal stays separate from confirmed club state until the authority answers. */
export function LineupBoard({club,blocked,onAction}:{club:GameState;blocked:boolean;onAction:(action:ClubAction)=>void}){
 const [proposal,setProposal]=useState<{slot:LineupSlotId;player:string}|null>(null);
 const confirmed=lineupView(club);
 const preview=proposal?compareLineupChange(club,proposal.slot,proposal.player):null;
 const displayed=lineupView(club,preview?.assignment??lineupOf(club));
 const signature=JSON.stringify(lineupOf(club));
 useEffect(()=>{setProposal(null)},[signature]);
 const value=(n:number)=>Number(n.toFixed(1));
 const ratings=['attack','defense','speed','power','iq'] as const;
 const save=()=>{if(preview?.valid&&!blocked)onAction({type:'lineup.set',lineup:preview.assignment as LineupAssignment});};
 return <section className="fhq-lineup" aria-label="Stadium starting lineup">
  <header><div><small>STADIUM STARTERS</small><h3>Your starting nine</h3></div><span>{confirmed.filled}/{confirmed.total} filled · {confirmed.reserves.length} reserves</span></header>
  <p>Only starters determine Stadium ratings. Reserves keep developing without lowering your team. Base raids use their own deployment groups.</p>
  <div className="fhq-lineup-ratings">{ratings.map(key=><div key={key}><small>{key==='iq'?'IQ':key==='power'?'Strength':key}</small><strong>{value(confirmed.ratings[key])}{preview&&preview.after[key]!==preview.before[key]&&<span> → {value(preview.after[key])}</span>}</strong></div>)}</div>
  {(['offense','defense'] as const).map(side=><fieldset key={side} disabled={blocked}><legend>{side==='offense'?'Offense':'Defense'}</legend><div className="fhq-lineup-slots">{displayed.slots.filter(s=>s.side===side).map(s=><label key={s.slot}><span>{s.label}{s.outOfPosition?' · out of position':''}</span><select aria-label={`${s.label} starter`} value={s.playerId??''} onChange={e=>setProposal({slot:s.slot,player:e.target.value})}><option value="" disabled>Choose a starter</option>{s.candidates.map(c=><option key={c.playerId} value={c.playerId}>{c.name} · {c.role} · {c.power}{c.selectedElsewhere&&c.selectedElsewhere!==s.slot?' · swap starter':''}{c.outOfPosition?' · out of position':''}</option>)}</select></label>)}</div></fieldset>)}
  {preview&&<div className="fhq-lineup-proposal" role="status"><p>{preview.incoming?.name} replaces {preview.outgoing?.name??'an empty slot'}. This is a preview until confirmed.</p>{preview.blockers.map((b,i)=><p key={i}>{b.message}</p>)}<button disabled={blocked||!preview.valid} onClick={save}>{blocked?'Confirming lineup…':'Confirm starting lineup'}</button><button disabled={blocked} onClick={()=>setProposal(null)}>Cancel change</button></div>}
  {!preview&&<p role="status">{blocked?'Waiting for club confirmation…':`Current starters · ${confirmed.reserves.map(p=>p.name).join(', ')||'none'} in reserve`}</p>}
  {club.stadiumFootball?.game&&!club.stadiumFootball.game.collected&&<p>Your current Stadium game keeps the lineup recorded at kickoff. Changes apply to your next game.</p>}
  {!confirmed.valid&&!preview&&confirmed.blockers.map((b,i)=><p role="alert" key={i}>{b.message}</p>)}
 </section>;
}
