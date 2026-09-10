import { heroKeyForPresentation } from '../game/battleReadability';
import { useState } from 'react';
import { HERO_DEFS, TROOP_STATS, type BTroop, type BBuilding, type RaidHero } from '../battle';

/** A read-only view of the actual actors, including ordinary squad players. */
export function BattleFieldReport({ troops, guards, buildings, heroes }: {
  troops: BTroop[]; guards: BTroop[]; buildings: BBuilding[]; heroes: RaidHero[];
}) {
  const [open, setOpen] = useState(false);
  const name = (actor: BTroop) => heroes.find(h => h.key === heroKeyForPresentation(actor))?.name
    ?? HERO_DEFS.find(h => h.key === heroKeyForPresentation(actor))?.name
    ?? actor.nameTag ?? (actor.special === 'mascot' ? 'Mascot' : actor.special === 'fan' ? 'Fan Mob' : `${actor.jersey ? `#${actor.jersey} ` : ''}${TROOP_STATS[actor.unit].label}`);
  const target = (actor: BTroop) => {
    const player = [...troops, ...guards].find(t => t.id === actor.targetId);
    if (player) return name(player);
    const building = buildings.find(b => b.id === actor.targetId);
    return building ? building.kind === 'hq' ? 'Stadium' : building.kind === 'wall' ? 'Wall' : building.kind === 'defense' ? 'Defense equipment' : 'Facility' : null;
  };
  return <details className="mb-2 rounded-xl border border-slate-700 text-left" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-bold text-white">On the field · Attackers {troops.filter(t => !t.dead).length} · Defenders {guards.filter(t => !t.dead).length}</summary>
    {open && <div className="max-h-52 overflow-y-auto px-3 pb-3 text-xs text-slate-300">
      <p className="mb-2">Live roster. The game keeps running while you inspect it.</p>
      {([['Attack', troops], ['Defense', guards]] as const).map(([side, actors]) => <section key={side} aria-label={`${side} roster`}>
        <h3 className="mt-2 font-bold text-orange-300">{side}</h3>
        {!actors.length && <p>No players on this side yet.</p>}
        {actors.map(actor => { const currentTarget = target(actor); return <div key={actor.id} className="border-b border-slate-800 py-2">
          <p className="font-bold text-white">{name(actor)}{actor.role ? ` · ${actor.role}` : ''}</p>
          <p>Grit {Math.max(0, Math.round(actor.hp))}/{Math.round(actor.maxHp)} · {actor.dead ? 'Subbed out' : actor.activeAction ? 'Signature in progress' : actor.attacking ? 'Engaging' : actor.moving ? 'Moving' : 'Holding position'}{!actor.dead && currentTarget ? ` · Target: ${currentTarget}` : ''}</p>
          {!actor.dead && <p>{[actor.rageT > 0 && 'Blitz active', actor.healT > 0 && 'Recovering', (actor.shieldT ?? 0) > 0 && 'Shielded', (actor.slowT ?? 0) > 0 && 'Slowed'].filter(Boolean).join(' · ')}</p>}
        </div>; })}
      </section>)}
    </div>}
  </details>;
}
