
import React, { useEffect, useRef, useState } from 'react';
import { Player, ResourceType, BuildingInstance, RecruitSlot, BuildingType } from '../types';
import { RARITY_CONFIG, UPGRADE_CONFIG, RECRUIT_CONFIG } from '../constants';
import { rosterCap, rollBoard, candidateOvr, recruitCost, recruitSeconds } from '../recruiting';
import { unitSprite, buildingSprite, BUILDING_ART_LEVELS, BUILDING_ERAS } from '../assets';
import { Search, Coins, Crown, Zap, ArrowUpCircle, Users, Clock, CheckCircle2, RefreshCw, Dumbbell, Brain, Lock } from 'lucide-react';
import { Sheet, HowTo } from './ui';

interface Props {
  resources: Record<ResourceType, number>;
  roster: Player[];
  recruitSlot: RecruitSlot | null;
  academy: BuildingInstance;
  stadiumLevel: number;
  onClose: () => void;
  onStartRecruit: (candidate: Player, cost: number) => void;
  onRush: () => void;
  onSign: () => void;
  onUpgrade: (buildingId: string, cost: number) => void;
}

const fmt = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

const RarityBadge: React.FC<{ rarity: Player['rarity'] }> = ({ rarity }) => (
  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${RARITY_CONFIG[rarity].color}`}>
    {rarity}
  </span>
);

const StatPip: React.FC<{ icon: React.ReactNode; value: number }> = ({ icon, value }) => (
  <div className="flex items-center gap-1 text-slate-300">
    {icon}<span className="font-mono text-xs">{value}</span>
  </div>
);

export const ScoutingModal: React.FC<Props> = ({ resources, roster, recruitSlot, academy, stadiumLevel, onClose, onStartRecruit, onRush, onSign, onUpgrade }) => {
  const [board, setBoard] = useState<Player[]>(() => rollBoard());

  // When a scouting job clears (signed), refresh the prospect board.
  const prevSlot = useRef(recruitSlot);
  useEffect(() => {
    if (prevSlot.current && !recruitSlot) setBoard(rollBoard());
    prevSlot.current = recruitSlot;
  }, [recruitSlot]);

  const cap = rosterCap(academy.level);
  const rosterFull = roster.length >= cap;
  const now = Date.now();
  const upgradeCost = Math.floor(UPGRADE_CONFIG.baseCost * Math.pow(UPGRADE_CONFIG.costMultiplier, academy.level - 1));
  const upgradeGated = academy.level >= stadiumLevel; // capped at Stadium level

  const slotReady = recruitSlot && now >= recruitSlot.finishTime;
  const slotBusy = recruitSlot && now < recruitSlot.finishTime;

  const renderCandidate = (c: Player) => {
    const cost = recruitCost(c);
    const secs = recruitSeconds(c);
    const canAfford = resources.COINS >= cost;
    const blocked = rosterFull || !!recruitSlot;
    const disabled = !canAfford || blocked;

    return (
      <div key={c.id} className={`relative rounded-2xl border-2 ${RARITY_CONFIG[c.rarity].border} bg-slate-900/80 overflow-hidden flex flex-col`}>
        <div className={`absolute inset-0 opacity-10 bg-gradient-to-b ${RARITY_CONFIG[c.rarity].color}`} />

        {/* Portrait */}
        <div className="relative h-28 flex items-end justify-center bg-gradient-to-b from-emerald-800/30 to-slate-900 overflow-hidden">
          <img src={unitSprite(c.unit, 'ready')} alt={c.role} draggable={false} className="h-[125%] max-w-none w-auto object-contain -mb-2 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] select-none" />
          <div className="absolute top-2 left-2"><RarityBadge rarity={c.rarity} /></div>
          <div className="absolute top-2 right-2 bg-black/70 rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-white">{c.role}</div>
        </div>

        <div className="relative p-3 flex flex-col gap-2 flex-1">
          <div>
            <div className="font-display font-bold text-white leading-tight">{c.name}</div>
            <div className="text-[10px] text-slate-400 uppercase">OVR <span className="text-white font-bold">{candidateOvr(c)}</span></div>
          </div>

          <div className="flex items-center gap-3 border-y border-slate-800 py-1.5">
            <StatPip icon={<Dumbbell size={11} className="text-red-400" />} value={c.stats.strength} />
            <StatPip icon={<Zap size={11} className="text-yellow-400" />} value={c.stats.speed} />
            <StatPip icon={<Brain size={11} className="text-blue-400" />} value={c.stats.iq} />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><Clock size={10} /> {fmt(secs)}</span>
          </div>

          <button
            onClick={() => onStartRecruit(c, cost)}
            disabled={disabled}
            className={`mt-1 w-full py-3 rounded-xl font-bold text-base flex items-center justify-center gap-1.5 transition-all active:scale-95
              ${disabled ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg ring-2 ring-yellow-400/40'}`}
          >
            <Search size={16} /> Scout
            <span className="flex items-center gap-0.5 text-sm bg-black/20 px-2 py-0.5 rounded"><Coins size={12} /> {cost}</span>
          </button>
          {!canAfford && !blocked && <div className="text-[9px] text-red-400 text-center">Not enough coins</div>}
        </div>
      </div>
    );
  };

  const renderInProgress = () => {
    if (!recruitSlot) return null;
    const c = recruitSlot.candidate;
    const remaining = (recruitSlot.finishTime - now) / 1000;
    const total = recruitSeconds(c);
    const pct = Math.max(0, Math.min(100, (1 - remaining / total) * 100));
    const canRush = resources.GEMS >= RECRUIT_CONFIG.rushGemCost;

    return (
      <div className="flex flex-col items-center gap-5 py-4 animate-fade-in">
        <div className={`relative w-44 h-44 rounded-2xl border-2 ${RARITY_CONFIG[c.rarity].border} overflow-hidden bg-gradient-to-b from-emerald-800/30 to-slate-900 flex items-end justify-center`}>
          <img src={unitSprite(c.unit, slotReady ? 'idle' : 'training')} alt={c.role} draggable={false} className="h-[120%] max-w-none w-auto object-contain -mb-2 drop-shadow-[0_6px_8px_rgba(0,0,0,0.5)] select-none" />
          <div className="absolute top-2 left-2"><RarityBadge rarity={c.rarity} /></div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-display font-bold text-white">{c.name}</div>
          <div className="text-sm text-slate-400">{c.role} • OVR {candidateOvr(c)}</div>
        </div>

        {slotReady ? (
          <button onClick={onSign} className="w-full max-w-xs py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-xl uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl animate-bounce-sm">
            <CheckCircle2 size={24} /> Sign Player
          </button>
        ) : (
          <div className="w-full max-w-xs space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span className="flex items-center gap-1"><Clock size={14} /> Scouting…</span>
              <span className="font-mono font-bold text-white">{fmt(remaining)}</span>
            </div>
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <button
              onClick={onRush}
              disabled={!canRush}
              className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95
                ${canRush ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
            >
              <Crown size={16} className="fill-current" /> Rush ({RECRUIT_CONFIG.rushGemCost} Gems)
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet
      title="Scouting Dept"
      icon={<Search className="text-sky-400" size={22} />}
      subtitle={<span className="flex items-center gap-2"><Users size={13} /> Roster {roster.length} / {cap}<span className="text-slate-600">•</span> Facility Lv {academy.level}</span>}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <div className="text-slate-300 font-bold">Expand Facility</div>
            <div className="text-[12px] text-slate-500">Lv {academy.level} → {academy.level + 1} • roster cap {cap} → {cap + RECRUIT_CONFIG.capPerLevel}</div>
          </div>
          {upgradeGated ? (
            <div className="py-2.5 px-4 rounded-xl font-bold text-[12px] flex items-center gap-2 bg-slate-800 text-slate-400 border border-slate-700">
              <Lock size={14} className="text-slate-500" /> Requires Stadium Lv {academy.level + 1}
            </div>
          ) : (
            <button
              onClick={() => onUpgrade(academy.id, upgradeCost)}
              disabled={resources.COINS < upgradeCost}
              className={`py-2.5 px-4 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95
                ${resources.COINS >= upgradeCost ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
            >
              <ArrowUpCircle size={16} /> Upgrade
              <span className="flex items-center gap-0.5 text-[12px] bg-black/20 px-1.5 py-0.5 rounded"><Coins size={11} /> {upgradeCost}</span>
            </button>
          )}
        </div>
      }
    >
        <div className="p-5">
          <div className="mb-4">
            <HowTo id="scouting" lines={[
              'Scout new players with Coins — rarer prospects cost more and take longer to sign.',
              'One scouting job at a time; Rush it with Crowns if you can’t wait.',
              'Roster cap grows with this facility’s level. Bigger roster = stronger raids AND defense.',
            ]} />
          </div>
          {recruitSlot ? (
            renderInProgress()
          ) : rosterFull ? (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
              <Users size={48} className="text-slate-700" />
              <div>
                <h3 className="text-xl font-bold text-slate-300">Roster Full ({roster.length}/{cap})</h3>
                <p className="text-slate-500 text-sm max-w-xs mt-1">Upgrade the Scouting Dept to expand your roster and sign more players.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-blue-300 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                  Tap Scout to sign a prospect
                </h3>
                <button onClick={() => setBoard(rollBoard())} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full transition-colors">
                  <RefreshCw size={13} /> New Prospects
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {board.map(renderCandidate)}
              </div>
            </>
          )}

          {/* 📸 THE DRAFT BOARD STORY — the department's era-by-era progression photos,
              from an easel under a canopy to Draft Command. Current era highlighted. */}
          {(() => {
            const tiers = BUILDING_ART_LEVELS(BuildingType.YOUTH_ACADEMY);
            const eras = BUILDING_ERAS[BuildingType.YOUTH_ACADEMY];
            const wearing = [...tiers].filter(l => l <= academy.level).pop() ?? tiers[0];
            return (
              <div className="mt-6 pt-5 border-t border-slate-800">
                <div className="text-[12px] uppercase tracking-widest text-slate-500 font-bold mb-3">The story of your Scouting Dept</div>
                <div className="flex items-end justify-between gap-2">
                  {tiers.map((lvl, ti) => {
                    const reached = academy.level >= lvl;
                    const current = wearing === lvl;
                    return (
                      <div key={lvl} className={`flex-1 flex flex-col items-center gap-1 min-w-0 ${reached ? '' : 'opacity-45'}`}>
                        <img src={buildingSprite(BuildingType.YOUTH_ACADEMY, lvl)} alt={`Level ${lvl}`} draggable={false}
                          className={`w-full h-auto rounded-xl ${current ? 'ring-2 ring-orange-500 bg-orange-500/10' : ''} ${reached ? '' : 'grayscale'}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-tight leading-none text-center ${current ? 'text-orange-300' : reached ? 'text-slate-300' : 'text-slate-600'}`}>{eras[ti]}</span>
                        <span className={`text-[10px] font-mono leading-none ${current ? 'text-orange-400' : reached ? 'text-slate-400' : 'text-slate-600'}`}>L{lvl}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
    </Sheet>
  );
};
