import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {createInitialState} from '../game/initialState';import {applyClubAction,type ClubAction} from '../game/authority/clubActions';
import {StadiumFootball} from '../components/StadiumFootball';import '../tailwind.css';import '../game-theme.css';import '../connected-campus.css';
function Fixture(){const [club,setClub]=useState(()=>{const c=createInitialState();c.teamName='Performance Review';return c;});const [notice,setNotice]=useState('');
 const action=(a:ClubAction)=>setClub(c=>{const r=applyClubAction(c,a,{now:Date.now(),random:()=>.4});setNotice(r.ok?'Confirmed by local rules':r.message);return r.state;});
 return <main style={{maxWidth:860,padding:14,margin:'auto',fontFamily:'system-ui'}}><small>LOCAL ACCEPTANCE · NO LIVE ACCOUNT</small><StadiumFootball club={club} blocked={false} onAction={action}/><p>{notice}</p></main>;
}createRoot(document.getElementById('root')!).render(<Fixture/>);
