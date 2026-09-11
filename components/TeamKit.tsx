import React,{createContext,useContext,useEffect,useRef} from 'react';
import { useClubStyle } from './ClubStyle';
import { assetUrl } from '../game/assetUrl';
import { teamKitFrame, type TeamKit } from '../game/teamKit';
export const TeamKitContext=createContext<TeamKit|undefined>(undefined);
export const useTeamKit=()=>useContext(TeamKitContext);
export function TeamKitProvider({name,children}:{name:string;children:React.ReactNode}){const kit=useClubStyle(name);return <TeamKitContext.Provider value={kit}>{children}</TeamKitContext.Provider>;}
/** Overlay leaves the original image available until its colored frame is ready. */
export function KitLayer({src,kit,style,className=''}:{src:string;kit?:TeamKit;style?:React.CSSProperties;className?:string}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(!kit)return;let alive=true;const image=new Image();image.onload=()=>{if(!alive||!kit)return;const canvas=ref.current,ctx=canvas?.getContext('2d');if(!ctx)return;canvas!.width=image.naturalWidth;canvas!.height=image.naturalHeight;ctx.clearRect(0,0,canvas!.width,canvas!.height);ctx.drawImage(teamKitFrame(image,kit),0,0);};image.src=assetUrl(src);return()=>{alive=false;image.onload=null;};},[src,kit]);
  return kit?<canvas data-team-kit={kit.id} aria-hidden="true" ref={ref} width={192} height={192} className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${className}`} style={style}/>:null;
}
