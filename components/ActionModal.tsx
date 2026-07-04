
import React from 'react';
import { BuildingInstance, BuildingType, ResourceType, UpgradeJob } from '../types';
import { BUILDING_INFO, UPGRADE_CONFIG, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, buildingEffect } from '../constants';
import { X, ArrowUpCircle, Coins, Hammer, Lock, Clock, Crown, Zap } from 'lucide-react';

interface Props {
  building: BuildingInstance | null;
  resources: Record<ResourceType, number>;
  stadiumLevel: number;
  upgrades: UpgradeJob[];
  builders: number;
  onClose: () => void;
  onUpgrade: (buildingId: string, cost: number) => void;
  onFinishNow: (jobId: string) => void;
  onHireBuilder: () => void;
}

const fmt = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

export const ActionModal: React.FC<Props> = ({ building, resources, stadiumLevel, upgrades, builders, onClose, onUpgrade, onFinishNow, onHireBuilder }) => {
  if (!building) return null;

  const info = BUILDING_INFO[building.type];
  const cost = Math.floor(UPGRADE_CONFIG.baseCost * Math.pow(UPGRADE_CONFIG.costMultiplier, building.level - 1));
  const canAfford = resources.COINS >= cost;

  const isStadium = building.type === BuildingType.STADIUM;
  const gated = !isStadium && building.level >= stadiumLevel;

  const job = upgrades.find(u => u.kind === 'building' && u.key === building.id);
  const buildersFree = builders - upgrades.length;
  const dur = upgradeDurationSecs(building.level + 1);

  const remaining = job ? Math.max(0, (job.finishTime - Date.now()) / 1000) : 0;
  const progress = job ? Math.max(0, Math.min(1, (Date.now() - job.startTime) / (job.finishTime - job.startTime))) : 0;
  const gemCost = skipGemCost(remaining);

  const hireCost = builderHireCost(builders);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose}></div>

      <div className="bg-slate-900 w-[90%] max-w-sm rounded-2xl border border-slate-700 shadow-2xl pointer-events-auto overflow-hidden relative">
        <div className={`h-28 ${info.color} bg-opacity-20 relative flex items-center justify-center overflow-hidden`}>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
          <Hammer size={56} className="text-white/10" />
          <div className="absolute bottom-4 left-4">
            <h2 className="text-2xl font-bold text-white drop-shadow-md">{info.name}</h2>
            <div className="text-xs font-bold bg-black/50 px-2 py-1 rounded text-white/80 w-fit">LVL {building.level}{job ? ` → ${job.toLevel}` : ''}</div>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/30 hover:bg-black/50 rounded-full text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6">
          <p className="text-slate-400 text-sm mb-5">{info.description}</p>

          {(() => {
            // Show the REAL wired effect (income / drill XP / regen / roster cap / readiness).
            const eff = buildingEffect(building.type, building.level);
            const nextEff = buildingEffect(building.type, building.level + 1);
            return (
              <div className="mb-6">
                <div className="text-center text-[11px] uppercase tracking-wide text-slate-500 font-bold mb-2">{eff.label}</div>
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Current</div>
                    <div className="text-2xl font-mono text-white">{eff.value}</div>
                  </div>
                  <ArrowUpCircle className="text-green-500" size={24} />
                  <div className="text-center">
                    <div className="text-xs text-green-500 uppercase font-bold mb-1">Next Level</div>
                    <div className="text-2xl font-mono text-green-400">{nextEff.value}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {job ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-blue-300 font-bold"><Clock size={15} /> Under construction…</span>
                <span className="font-mono font-bold text-white">{fmt(remaining)}</span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${progress * 100}%` }} />
              </div>
              <button onClick={() => onFinishNow(job.id)} disabled={resources.GEMS < gemCost}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95
                  ${resources.GEMS >= gemCost ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                <Crown size={16} className="fill-current" /> Finish Now
                <span className="text-sm bg-black/20 px-2 py-0.5 rounded">{gemCost} gems</span>
              </button>
            </div>
          ) : gated ? (
            <div className="w-full py-3 rounded-xl font-bold text-sm bg-slate-800 text-slate-400 flex items-center justify-center gap-2 border border-slate-700">
              <Lock size={16} className="text-slate-500" /> Upgrade Stadium to Lv {building.level + 1} to unlock
            </div>
          ) : (
            <>
              <button onClick={() => onUpgrade(building.id, cost)} disabled={!canAfford || buildersFree <= 0}
                className={`w-full py-3 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95
                  ${canAfford && buildersFree > 0 ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                {buildersFree <= 0 ? 'ALL BUILDERS BUSY' : canAfford ? 'UPGRADE' : 'NEED COINS'}
                <div className="flex items-center gap-1 text-sm bg-black/20 px-2 py-0.5 rounded"><Coins size={14} /> {cost}</div>
              </button>
              <div className="text-center text-[11px] text-slate-500 mt-2 flex items-center justify-center gap-1"><Clock size={11} /> Takes {fmt(dur)}</div>
            </>
          )}

          {/* Builders status */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <Hammer size={15} className="text-amber-400" /> Builders <span className="font-mono font-bold">{buildersFree}/{builders}</span> free
            </div>
            {builders < MAX_BUILDERS && (
              <button onClick={onHireBuilder} disabled={resources.GEMS < hireCost}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors ${resources.GEMS >= hireCost ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                <Zap size={12} /> Hire ({hireCost} gems)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
