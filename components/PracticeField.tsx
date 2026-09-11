import {useState} from 'react';
import {FOOTBALL_PLAYS,type FootballPlay} from '../game/development';
import type {GameState} from '../types';
import type {ClubAction} from '../game/authority/clubActions';
import {FootballPlayView} from './FootballPlayView';
import {DevelopmentPanel} from './DevelopmentPanel';
import {Sheet} from './ui';
export function PracticeField({initialPlayer,club,blocked,onAction,onClose,onRoster,onStadium}:{initialPlayer?:string;club:GameState;blocked:boolean;onAction:(a:ClubAction)=>void;onClose:()=>void;onRoster:()=>void;onStadium:()=>void}){
 const[play,setPlay]=useState<FootballPlay>('slants'),[playing,setPlaying]=useState(true);
 return <Sheet title="Practice Field" subtitle="Routes, timing and team preparation" onClose={onClose} maxWidth="max-w-6xl"><div className="fhq-practice-workspace"><section><div className="fhq-play-choices">{(Object.keys(FOOTBALL_PLAYS) as FootballPlay[]).map(k=><button key={k} aria-pressed={play===k} onClick={()=>setPlay(k)}>{FOOTBALL_PLAYS[k].name}</button>)}</div><FootballPlayView play={play} playing={playing}/><button className="fhq-film-control" aria-pressed={!playing} onClick={()=>setPlaying(v=>!v)}>{playing?'Pause the play':'Run the play'}</button><p className="fhq-development-note">Eleven on eleven · practice demonstration. Timed field sessions grow your players’ Speed and team readiness.</p><nav className="fhq-player-room-nav"><button onClick={onRoster}>Your roster</button><button onClick={onStadium}>Stadium football</button></nav></section><DevelopmentPanel key={initialPlayer??"practice"} focusedPlayer={club.roster.find(p=>p.id===initialPlayer)?.name} initialUnit={club.roster.find(p=>p.id===initialPlayer)?.unit??"ALL"} club={club} station="practice" play={play} blocked={blocked} onAction={onAction}/></div></Sheet>;
}
