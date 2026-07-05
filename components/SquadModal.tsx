

import React, { useState } from 'react';
import { Player, UnitGroup, ResourceType, Drill, PlayerRole } from '../types';
import { DRILLS, RARITY_CONFIG, TENDENCIES, TendencyKey } from '../constants';
import { unitSprite } from '../assets';
import { Shield, Target, Users, Zap, Dumbbell, Brain, ChevronRight, ChevronLeft, Play, Check, Star } from 'lucide-react';
import { Sheet } from './ui';

interface Props {
  roster: Player[];
  resources: Record<ResourceType, number>;
  onClose: () => void;
  onTrainGroup: (unit: UnitGroup, drillId: string) => void;
  onOpenHeroes?: () => void;
}

export const SquadModal: React.FC<Props> = ({ roster, resources, onClose, onTrainGroup, onOpenHeroes }) => {
  const [activeTab, setActiveTab] = useState<'OFFENSE' | 'DEFENSE'>('OFFENSE');
  const [selectedUnit, setSelectedUnit] = useState<UnitGroup | null>(null);

  // Helper to calculate Group OVR
  const getGroupStats = (unit: UnitGroup) => {
    const players = roster.filter(p => p.unit === unit);
    if (players.length === 0) return { ovr: 0, count: 0 };
    const avg = players.reduce((acc, p) => acc + (p.stats.strength + p.stats.speed + p.stats.iq)/3, 0) / players.length;
    return { ovr: Math.floor(avg), count: players.length };
  };

  const renderUnitCard = (unit: UnitGroup, title: string, subtitle: string, icon: React.ReactNode, color: string) => {
    const { ovr, count } = getGroupStats(unit);
    const isSelected = selectedUnit === unit;

    return (
      <div
        onClick={() => setSelectedUnit(unit)}
        className={`relative overflow-hidden rounded-2xl border-2 transition-all cursor-pointer group active:scale-95
          ${isSelected
            ? 'border-green-400 scale-[1.03] shadow-2xl ring-2 ring-green-400/50'
            : `border-slate-700 hover:border-blue-400 bg-slate-800/50 ${!selectedUnit ? 'ring-2 ring-blue-500/40' : ''}`}
        `}
      >
        <div className={`absolute inset-0 opacity-10 ${color}`}></div>

        {isSelected && (
          <div className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-green-500 border-2 border-white flex items-center justify-center shadow-lg">
            <Check size={18} className="text-white" strokeWidth={3} />
          </div>
        )}

        <div className="p-6 pb-4 flex flex-col items-center text-center gap-2">
           {/* Real unit sprite (player trio) framed on a subtle field disc */}
           <div className={`relative w-28 h-28 rounded-full bg-gradient-to-b from-emerald-700/40 to-slate-900 border border-slate-700 shadow-xl overflow-hidden flex items-end justify-center ${isSelected ? 'scale-105' : ''} transition-transform`}>
             <img
               src={unitSprite(unit, isSelected ? 'ready' : 'idle')}
               alt={title}
               draggable={false}
               className="w-[118%] max-w-none h-auto object-contain -mb-1 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] select-none"
             />
             <div className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/80 border border-slate-700">
               {React.cloneElement(icon as React.ReactElement<any>, { size: 14, className: isSelected ? 'text-white' : 'text-slate-400' })}
             </div>
           </div>

           <div>
             <h3 className="font-display font-bold text-xl uppercase tracking-wider">{title}</h3>
             <p className="text-xs text-slate-400 font-mono">{count} Players • {subtitle}</p>
           </div>

           <div className="mt-2 w-full bg-black/40 rounded-full h-8 flex items-center justify-center border border-white/10">
             <span className={`font-mono font-bold ${ovr > 80 ? 'text-yellow-400' : 'text-white'}`}>OVR: {ovr}</span>
           </div>
        </div>

        <div className={`text-center text-[10px] font-bold uppercase tracking-widest py-2 ${isSelected ? 'bg-green-600 text-white' : 'bg-slate-800/80 text-blue-300'}`}>
          {isSelected ? '✓ Selected' : 'Tap to coach'}
        </div>
      </div>
    );
  };

  const renderDrillSelection = () => {
    if (!selectedUnit) return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
        <ChevronLeft size={30} className="text-blue-500 animate-pulse hidden lg:block" />
        <p className="text-sm font-bold text-slate-400">Pick a position group first
          <br /><span className="text-slate-600 font-normal">then choose a drill to run here</span></p>
      </div>
    );

    // Filter drills for this unit
    const availableDrills = Object.values(DRILLS).filter(d => d.targetUnit === selectedUnit);

    return (
      <div className="animate-fade-in space-y-3">
        <h3 className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
          Choose a drill to run
        </h3>
        {availableDrills.map(drill => {
           const canAfford = resources.ENERGY >= drill.costEnergy;
           return (
             <button
               key={drill.id}
               onClick={() => onTrainGroup(selectedUnit, drill.id)}
               disabled={!canAfford}
               className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left active:scale-95 group
                 ${canAfford
                   ? 'bg-slate-800 border-blue-500/40 hover:bg-slate-700 hover:border-blue-400 shadow-lg'
                   : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'}
               `}
             >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 bg-black rounded-xl flex items-center justify-center border border-slate-700 shrink-0">
                    <Dumbbell size={24} className={canAfford ? 'text-blue-400' : 'text-slate-600'} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-lg text-white truncate">{drill.name}</h4>
                    <div className="flex gap-3 text-xs text-slate-400">
                       <span className="flex items-center gap-1"><Zap size={11} /> +{drill.readinessGain}% Ready</span>
                       <span className="text-slate-500">−{drill.costEnergy} E • {drill.durationSeconds}s</span>
                    </div>
                  </div>
                </div>

                <div className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm ${canAfford ? 'bg-blue-600 text-white group-hover:bg-blue-500' : 'bg-slate-800 text-slate-500'}`}>
                  <Play size={15} fill="currentColor" /> {canAfford ? 'Train' : 'Low E'}
                </div>
             </button>
           );
        })}
      </div>
    );
  };

  return (
    <Sheet
      title="Coaching Staff"
      icon={<Users className="text-sky-400" size={22} />}
      subtitle="Develop position groups individually to build team readiness."
      onClose={onClose}
      maxWidth="max-w-5xl"
      scroll={false}
      actions={
        <button onClick={onOpenHeroes} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-full text-black font-bold flex items-center gap-1.5 transition-colors text-sm">
          <Star size={15} className="fill-current" /> Heroes
        </button>
      }
    >
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

          {/* LEFT: Unit Selector */}
          <div className="flex-1 p-6 overflow-y-auto bg-gradient-to-br from-slate-900 to-slate-950">
             {/* Step guide */}
             <div className="mb-4 flex items-center gap-2.5 bg-blue-950/50 border border-blue-800/50 rounded-xl px-3 py-2.5">
               <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">{selectedUnit ? '2' : '1'}</span>
               <span className="text-sm text-blue-100 font-bold">{selectedUnit ? 'Now pick a drill on the right to train them →' : 'Tap a position group below to coach it'}</span>
             </div>

             {/* Toggle */}
             <div className="flex p-1 bg-black/40 rounded-xl mb-6 border border-slate-800">
                <button
                  onClick={() => setActiveTab('OFFENSE')}
                  className={`flex-1 py-3 rounded-lg font-bold uppercase tracking-wider transition-all ${activeTab === 'OFFENSE' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                >
                  Offense
                </button>
                <button
                  onClick={() => setActiveTab('DEFENSE')}
                  className={`flex-1 py-3 rounded-lg font-bold uppercase tracking-wider transition-all ${activeTab === 'DEFENSE' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                >
                  Defense
                </button>
             </div>

             {/* Units Grid */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTab === 'OFFENSE' ? (
                  <>
                    {renderUnitCard(UnitGroup.OFFENSE_LINE, 'The Trenches', 'OL Group', <Shield />, 'bg-red-500')}
                    {renderUnitCard(UnitGroup.OFFENSE_SKILL, 'Skill Positions', 'QB / WR / RB', <Zap />, 'bg-orange-500')}
                  </>
                ) : (
                  <>
                    {renderUnitCard(UnitGroup.DEFENSE_LINE, 'Front Seven', 'DL / LB', <Dumbbell />, 'bg-blue-500')}
                    {renderUnitCard(UnitGroup.DEFENSE_SECONDARY, 'No Fly Zone', 'CB / Safety', <Target />, 'bg-indigo-500')}
                  </>
                )}
             </div>

             {/* Roster List for Selected Unit (Flavor) */}
             {selectedUnit && (
               <div className="mt-8">
                 <h4 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Unit Roster</h4>
                 <div className="space-y-2">
                   {roster.filter(p => p.unit === selectedUnit).map(p => (
                     <div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded border border-slate-800">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: p.avatarColor }}>
                             {p.role}
                           </div>
                           <div className="flex flex-col">
                             <span className="font-bold text-slate-200 leading-tight">{p.name}</span>
                             {(() => { const t = TENDENCIES[p.tendency as TendencyKey]; return t ? (
                               <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: t.color }} title={t.desc}>{t.emoji} {t.label}</span>
                             ) : null; })()}
                           </div>
                        </div>
                        <div className="font-mono text-xs text-slate-400">LVL {p.level}</div>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>

          {/* RIGHT: Drill Coordinator */}
          <div className="w-full lg:w-[450px] bg-slate-950 border-l border-slate-800 flex flex-col">
             <div className="p-6 border-b border-slate-800 bg-black/20">
               <h3 className="font-display font-bold text-xl text-white">Training Schedule</h3>
               <p className="text-sm text-slate-500">Assign drills to improve unit cohesion.</p>
             </div>

             <div className="flex-1 p-6 overflow-y-auto">
                {renderDrillSelection()}
             </div>
          </div>

        </div>
    </Sheet>
  );
};
