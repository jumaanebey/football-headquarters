import {HeroArt} from './HeroArt';
import {HERO_DEFS} from '../battle';
import {gatePostsFor} from '../fixedBase';
import type {GameState} from '../types';

export function GateAssignments({club,blocked,onAssign}:{club:GameState;blocked:boolean;onAssign:(post:string,hero:string)=>void}) {
  const heroes=club.heroes.filter(h=>h.unlocked!==false);
  return <section className="fhq-gate-assignments" aria-label="Hero gate assignments">
    {gatePostsFor(club.formation).map(post=><section key={post.id} className="fhq-gate-post">
      <header><h3>{post.label}</h3><small>{club.heroGates[post.id]?'Assigned guard':'Auto · strongest available'}</small></header>
      <div className="fhq-gate-heroes">{heroes.map(h=>{const def=HERO_DEFS.find(d=>d.key===h.key);if(!def)return null;return <button key={h.key} disabled={blocked} aria-pressed={club.heroGates[post.id]===h.key} aria-label={`Assign ${def.name} to ${post.label}`} onClick={()=>onAssign(post.id,h.key)}>
        <HeroArt heroKey={h.key} art={def.art} label={def.name} className="fhq-gate-hero-art"/>
        <strong>{def.name.replace(/^The /,'')}</strong><small>{def.role} · L{h.level}</small>
      </button>})}</div>
    </section>)}
    <p>Tap a hero to assign them. One gate per hero; unassigned gates use your strongest available heroes.</p>
  </section>;
}
