import React, { useState } from 'react';
export function LandscapePlay() {
  const [message,setMessage]=useState('Turn your phone sideways for the wider field.');
  const [pending,setPending]=useState(false);
  const activate=async()=>{
    setPending(true);
    try {
      if(!document.fullscreenElement&&document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      const orientation=screen.orientation as ScreenOrientation & {lock?: (mode:string)=>Promise<void>};
      if(orientation?.lock) { await orientation.lock('landscape'); setMessage('Landscape play enabled.'); }
      else setMessage('Rotate your phone sideways. If it stays upright, turn off your phone’s rotation lock.');
    } catch { setMessage('Rotate your phone sideways. If it stays upright, turn off your phone’s rotation lock.'); }
    finally { setPending(false); }
  };
  return <section className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300"><h3 className="font-bold text-white">Landscape play</h3><p role="status" className="my-2">{message}</p><button disabled={pending} onClick={activate} className="min-h-11 rounded-lg bg-blue-600 px-3 font-bold text-white">{pending?'Opening…':'Play wide / full screen'}</button></section>;
}
