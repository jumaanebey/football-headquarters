
import React, { useState, useEffect } from 'react';
import { BuildingInstance, BuildingType, DrillState, Player, PlayerState, BonusOrb, UnitGroup, RecruitSlot, UpgradeJob } from '../types';
import { BUILDING_INFO, VOXEL_CONFIG, COLLECTOR_CONFIG, collectorCap, DECOR } from '../constants';
import { buildingSprite } from '../assets';
import { Check, Star, Dumbbell, Search, Coins, Hammer } from 'lucide-react';

interface Props {
  buildings: BuildingInstance[];
  players: Player[];
  bonusOrbs: BonusOrb[];
  timeOfDay: number; // 0-24
  recruitSlot?: RecruitSlot | null;
  upgrades?: UpgradeJob[];
  walls?: { gridX: number; gridY: number }[];
  editMode?: boolean;
  moveSel?: string | null;
  onTileEdit?: (gridX: number, gridY: number) => void;
  onBuildingClick: (building: BuildingInstance, screenPos: { x: number; y: number }) => void;
  onCollect: (building: BuildingInstance, screenPos: { x: number; y: number }) => void;
  onCollectResource?: (building: BuildingInstance, screenPos: { x: number; y: number }) => void;
  onOrbClick: (orb: BonusOrb, screenPos: { x: number; y: number }) => void;
}

// --- Isometric layout ---------------------------------------------------------
const GRID = VOXEL_CONFIG.gridSize;   // 10 logical tiles per side
const TILE_W = 118;
const TILE_H = 59;
const ORIGIN_X = (GRID * TILE_W) / 2;
const ORIGIN_Y = 210;                 // top padding so tall building sprites don't clip
const BOARD_W = GRID * TILE_W;        // 1180
const BOARD_H = 820;                  // full board canvas (fits content + headroom)

const fmtSecs = (s: number) => { const n = Math.max(0, Math.ceil(s)); return n < 60 ? `${n}s` : `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, '0')}`; };

const tileToScreen = (gx: number, gy: number) => ({
  x: (gx - gy) * (TILE_W / 2) + ORIGIN_X,
  y: (gx + gy) * (TILE_H / 2) + ORIGIN_Y,
});

const worldToScreen = (wx: number, wy: number) => tileToScreen((wx / 100) * GRID, (wy / 100) * GRID);

/** Fit the whole board into the viewport (both axes), leaving room for HUD + nav. */
const useBoardScale = () => {
  const compute = () => {
    if (typeof window === 'undefined') return 0.7;
    const availW = window.innerWidth - 24;
    const availH = window.innerHeight - 176; // HUD (~88) + nav (~88)
    return Math.max(0.32, Math.min(1.15, Math.min(availW / BOARD_W, availH / BOARD_H)));
  };
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
};

const GroundLayer: React.FC = () => {
  const diamonds = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      const c = tileToScreen(gx, gy);
      const even = (gx + gy) % 2 === 0;
      diamonds.push(
        <polygon
          key={`${gx}-${gy}`}
          points={`${c.x},${c.y - TILE_H / 2} ${c.x + TILE_W / 2},${c.y} ${c.x},${c.y + TILE_H / 2} ${c.x - TILE_W / 2},${c.y}`}
          fill={even ? '#2f9e44' : '#2b8a3e'}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={1}
        />
      );
    }
  }
  return (
    <svg className="absolute inset-0 pointer-events-none" width={BOARD_W} height={BOARD_H} style={{ overflow: 'visible' }}>
      {diamonds}
    </svg>
  );
};

/** Board-space (unscaled) point -> nearest grid cell, inverting the iso projection. */
const screenToTile = (bx: number, by: number) => {
  const a = (bx - ORIGIN_X) / (TILE_W / 2); // gx - gy
  const b = (by - ORIGIN_Y) / (TILE_H / 2); // gx + gy
  return { gx: Math.round((a + b) / 2), gy: Math.round((b - a) / 2) };
};

// Blocking Sled — a football-themed hazard-striped barrier.
const WallSprite: React.FC<{ gridX: number; gridY: number }> = ({ gridX, gridY }) => {
  const c = tileToScreen(gridX, gridY);
  const w = TILE_W * 0.62;
  return (
    <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: gridX + gridY + 1 }}>
      <div style={{ position: 'absolute', left: -w / 2, bottom: -TILE_H / 2 + 2, width: w, height: w * 0.55, borderRadius: 4, border: '1px solid rgba(0,0,0,0.5)', background: 'repeating-linear-gradient(45deg,#facc15 0 5px,#1f2937 5px 11px)', boxShadow: '0 3px 4px rgba(0,0,0,0.35)' }} />
    </div>
  );
};

const DecorSprite: React.FC<{ slug: string; gridX: number; gridY: number; scale: number }> = ({ slug, gridX, gridY, scale }) => {
  const c = tileToScreen(gridX, gridY);
  const w = TILE_W * 1.35 * scale;
  return (
    <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: gridX + gridY }}>
      <img src={`/assets/decor/${slug}.png`} alt="" draggable={false}
        style={{ position: 'absolute', width: w, maxWidth: 'none', height: 'auto', left: -w / 2, bottom: -TILE_H / 2, filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.3))' }} />
    </div>
  );
};

const BuildingSprite: React.FC<{
  building: BuildingInstance;
  recruitSlot?: RecruitSlot | null;
  upgradeJob?: UpgradeJob;
  editMode?: boolean;
  moveSel?: string | null;
  onBuildingClick: Props['onBuildingClick'];
  onCollect: Props['onCollect'];
  onCollectResource?: Props['onCollectResource'];
}> = ({ building, recruitSlot, upgradeJob, editMode, moveSel, onBuildingClick, onCollect, onCollectResource }) => {
  const c = tileToScreen(building.gridX, building.gridY);
  const info = BUILDING_INFO[building.type];
  const src = buildingSprite(building.type, building.level);

  const isCompleted = building.state === DrillState.COMPLETED;
  const isActive = building.state === DrillState.ACTIVE;

  const isAcademy = building.type === BuildingType.YOUTH_ACADEMY;
  const recruitReady = isAcademy && !!recruitSlot && Date.now() >= recruitSlot.finishTime;
  const recruitBusy = isAcademy && !!recruitSlot && Date.now() < recruitSlot.finishTime;

  const collectorCfg = COLLECTOR_CONFIG[building.type];
  const banked = Math.floor(building.accrued || 0);
  const cap = collectorCfg ? collectorCap(building.type, building.level) : 0;
  const showBubble = !!collectorCfg && banked >= 1;
  const bubbleReady = !!collectorCfg && banked >= Math.max(30, cap * 0.25);

  // A building is "actionable" (glowing) when there's something to tap.
  const actionable = isCompleted || recruitReady || bubbleReady;

  let progress = 0;
  if (isActive && building.startTime && building.finishTime) {
    progress = Math.max(0, Math.min(1, (Date.now() - building.startTime) / (building.finishTime - building.startTime)));
  }

  const handleClick = (e: React.MouseEvent) => {
    const screenPos = { x: e.clientX, y: e.clientY };
    if (isCompleted) onCollect(building, screenPos);
    else onBuildingClick(building, screenPos);
  };

  const SPRITE_W = TILE_W * 1.5; // sized to roughly match a tile footprint — edge cells no longer spill off the board

  return (
    <div className={`absolute group ${editMode ? '' : 'cursor-pointer'}`} style={{ left: c.x, top: c.y, zIndex: building.gridX + building.gridY + 5, pointerEvents: editMode ? 'none' : 'auto' }} onClick={editMode ? undefined : handleClick}>
      {/* Move-selection highlight (edit mode) */}
      {moveSel === building.id && (
        <div className="absolute -translate-x-1/2 rounded-full bg-blue-400/50 blur-sm animate-pulse pointer-events-none" style={{ left: 0, bottom: -TILE_H / 2 - 6, width: SPRITE_W * 0.9, height: TILE_H * 1.5 }} />
      )}
      {/* Glow ring under actionable buildings */}
      {actionable && (
        <div className="absolute -translate-x-1/2 rounded-[50%] bg-yellow-300/25 blur-md animate-pulse pointer-events-none"
          style={{ left: 0, bottom: -TILE_H / 2 - 6, width: SPRITE_W * 0.8, height: TILE_H * 1.1 }} />
      )}

      <img src={src} alt={info.name} draggable={false}
        className="select-none transition-transform group-hover:-translate-y-1 group-active:scale-95"
        style={{ position: 'absolute', width: SPRITE_W, maxWidth: 'none', height: 'auto', left: -SPRITE_W / 2, bottom: -TILE_H / 2, filter: 'drop-shadow(0 10px 8px rgba(0,0,0,0.35))' }} />

      {/* Name + level tag */}
      <div className="absolute -translate-x-1/2 pointer-events-none" style={{ left: 0, top: 8 }}>
        <span className="text-[10px] font-display font-bold text-white uppercase tracking-tight bg-black/55 px-2 py-0.5 rounded-full whitespace-nowrap">
          {info.name} <span className="text-yellow-300">L{building.level}</span>
        </span>
      </div>

      {/* Drill status badge */}
      {(isActive || isCompleted) && (
        <div className="absolute -translate-x-1/2" style={{ left: 0, top: -58, zIndex: 60 }}>
          {isCompleted ? (
            <div data-tour="drill-done" className="flex flex-col items-center gap-0.5">
              <div className="w-11 h-11 rounded-full bg-green-500 border-[3px] border-white flex items-center justify-center shadow-xl animate-bounce-sm">
                <Check size={24} className="text-white" strokeWidth={3.5} />
              </div>
              <span className="text-[9px] font-bold uppercase bg-green-600 text-white px-1.5 py-0.5 rounded-full">Collect</span>
            </div>
          ) : (
            <div className="w-11 h-11 rounded-full bg-black/70 border-2 border-slate-600 flex items-center justify-center relative">
              <Dumbbell size={16} className="text-blue-300" />
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray={`${progress * 100} 100`} pathLength={100} strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Recruit status badge */}
      {(recruitBusy || recruitReady) && (
        <div className="absolute -translate-x-1/2" style={{ left: 0, top: -58, zIndex: 60 }}>
          {recruitReady ? (
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-11 h-11 rounded-full bg-green-500 border-[3px] border-white flex items-center justify-center shadow-xl animate-bounce-sm">
                <Check size={24} className="text-white" strokeWidth={3.5} />
              </div>
              <span className="text-[9px] font-bold uppercase bg-green-600 text-white px-1.5 py-0.5 rounded-full">Sign</span>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-lg animate-pulse">
              <Search size={17} className="text-white" />
            </div>
          )}
        </div>
      )}

      {/* Under-construction badge */}
      {upgradeJob && (
        <div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: 0, top: -60, zIndex: 62 }}>
          <div className="w-10 h-10 rounded-full bg-amber-600 border-2 border-white flex items-center justify-center shadow-lg animate-pulse">
            <Hammer size={17} className="text-white" />
          </div>
          <span className="text-[9px] font-bold bg-black/70 text-amber-200 px-1.5 py-0.5 rounded-full mt-0.5">{fmtSecs((upgradeJob.finishTime - Date.now()) / 1000)}</span>
        </div>
      )}

      {/* Passive collector bubble — big, obvious tap target */}
      {showBubble && (
        <button
          data-tour="collect"
          className={`absolute -translate-x-1/2 flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border-[3px] border-white shadow-xl
            ${bubbleReady ? 'bg-amber-400 animate-bounce-sm' : 'bg-yellow-500 animate-float'}`}
          style={{ left: 0, top: -62, zIndex: 70 }}
          onClick={(e) => { e.stopPropagation(); onCollectResource?.(building, { x: e.clientX, y: e.clientY }); }}
          title={bubbleReady ? 'Storage filling — collect!' : 'Collect ticket revenue'}
        >
          <Coins size={18} className="text-yellow-900 fill-yellow-800" />
          <span className="text-sm font-display font-bold text-yellow-950">{banked}</span>
        </button>
      )}
    </div>
  );
};

// Players only appear on the field while actively training (no more idle wandering).
const PlayerMarker: React.FC<{ player: Player }> = ({ player }) => {
  const c = worldToScreen(player.worldPos.x, player.worldPos.y);
  const isTraining = player.state === PlayerState.TRAINING;

  let color = '#94a3b8';
  if (player.unit === UnitGroup.OFFENSE_LINE || player.unit === UnitGroup.OFFENSE_SKILL) color = '#ef4444';
  if (player.unit === UnitGroup.DEFENSE_LINE || player.unit === UnitGroup.DEFENSE_SECONDARY) color = '#3b82f6';

  return (
    <div className="absolute transition-all duration-[200ms] ease-linear animate-hop pointer-events-none"
      style={{ left: c.x, top: c.y, zIndex: Math.round((player.worldPos.y / 100) * GRID * 2) + 6, transform: 'translate(-50%,-100%)' }}>
      <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30" style={{ bottom: -4, width: 18, height: 7 }} />
      <div className="w-4 h-6 rounded-t-full rounded-b-sm border border-black/30 flex items-start justify-center shadow" style={{ backgroundColor: color }}>
        <span className="text-[7px] font-bold text-white/90 leading-tight mt-0.5">{player.role}</span>
      </div>
      {isTraining && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px]">💪</div>}
    </div>
  );
};

const BonusOrbSprite: React.FC<{ orb: BonusOrb; onOrbClick: Props['onOrbClick'] }> = ({ orb, onOrbClick }) => {
  const c = worldToScreen(orb.x, orb.y);
  return (
    <div className="absolute cursor-pointer animate-float" style={{ left: c.x, top: c.y, zIndex: 999, transform: 'translate(-50%,-100%)' }}
      onClick={(e) => onOrbClick(orb, { x: e.clientX, y: e.clientY })}>
      <div className="w-7 h-7 rounded-full bg-yellow-400 border-2 border-yellow-200 flex items-center justify-center shadow-[0_0_12px_rgba(250,204,21,0.7)]">
        <Star size={13} className="text-yellow-800 fill-yellow-800" />
      </div>
    </div>
  );
};

export const IsometricMap: React.FC<Props> = ({ buildings, players, bonusOrbs, timeOfDay, recruitSlot, upgrades = [], walls = [], editMode = false, moveSel, onTileEdit, onBuildingClick, onCollect, onCollectResource, onOrbClick }) => {
  const scale = useBoardScale();
  const boardRef = React.useRef<HTMLDivElement>(null);

  const night = timeOfDay < 6 || timeOfDay > 20;
  const dusk = (timeOfDay >= 6 && timeOfDay < 8) || (timeOfDay > 18 && timeOfDay <= 20);
  const ambient = night ? 'rgba(15,23,42,0.5)' : dusk ? 'rgba(251,146,60,0.16)' : 'rgba(0,0,0,0)';

  const sortedBuildings = [...buildings].sort((a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY));
  // Only render players who are heading to / at a drill.
  const activePlayers = players.filter(p => p.state !== PlayerState.IDLE);

  const handleBoardClick = (e: React.MouseEvent) => {
    if (!editMode || !onTileEdit || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const bx = (e.clientX - rect.left) * BOARD_W / rect.width;
    const by = (e.clientY - rect.top) * BOARD_H / rect.height;
    const { gx, gy } = screenToTile(bx, by);
    if (gx >= 0 && gx < GRID && gy >= 0 && gy < GRID) onTileEdit(gx, gy);
  };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #05070f 0%, #0a1024 30%, #10203a 55%, #0d2b23 80%, #081d17 100%)' }}>
      {/* Stadium-night backdrop: starfield, floodlight beams, and a warm field glow. */}
      <div className="absolute inset-x-0 top-0 h-3/5 pointer-events-none opacity-70" style={{
        backgroundImage: 'radial-gradient(1px 1px at 22% 28%, rgba(255,255,255,0.8), transparent 100%), radial-gradient(1px 1px at 68% 14%, rgba(255,255,255,0.6), transparent 100%), radial-gradient(1.5px 1.5px at 44% 40%, rgba(255,255,255,0.5), transparent 100%), radial-gradient(1px 1px at 84% 34%, rgba(255,255,255,0.7), transparent 100%), radial-gradient(1px 1px at 8% 12%, rgba(255,255,255,0.5), transparent 100%)',
        backgroundSize: '260px 220px', maskImage: 'linear-gradient(180deg, #000 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(180deg, #000 40%, transparent 100%)',
      }} />
      {/* Floodlight beams sweeping in from the top corners */}
      <div className="absolute pointer-events-none" style={{ top: '-12%', left: '-4%', width: '52%', height: '95%', background: 'linear-gradient(160deg, rgba(255,244,210,0.11), rgba(255,244,210,0.03) 45%, transparent 65%)', transform: 'rotate(6deg)', filter: 'blur(4px)' }} />
      <div className="absolute pointer-events-none" style={{ top: '-12%', right: '-4%', width: '52%', height: '95%', background: 'linear-gradient(200deg, rgba(255,244,210,0.11), rgba(255,244,210,0.03) 45%, transparent 65%)', transform: 'rotate(-6deg)', filter: 'blur(4px)' }} />
      {/* Warm halo grounding the field */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: '4%', width: '135%', height: '46%', background: 'radial-gradient(ellipse at center, rgba(45,158,68,0.30) 0%, rgba(22,90,52,0.12) 52%, transparent 72%)', filter: 'blur(10px)' }} />
      {/* Board fills space between HUD (top) and nav (bottom), scaled to fit */}
      <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: 88, bottom: 88 }}>
        <div ref={boardRef} onClick={handleBoardClick} className={`relative ${editMode ? 'cursor-pointer' : ''}`} style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${scale})`, transformOrigin: 'center' }}>
          <GroundLayer />
          {DECOR.map((d) => (
            <DecorSprite key={d.slug} slug={d.slug} gridX={d.gridX} gridY={d.gridY} scale={d.scale} />
          ))}
          {walls.map((w, i) => (
            <WallSprite key={`w${i}-${w.gridX}-${w.gridY}`} gridX={w.gridX} gridY={w.gridY} />
          ))}
          {sortedBuildings.map((b) => (
            <BuildingSprite key={b.id} building={b} recruitSlot={recruitSlot} upgradeJob={upgrades.find(u => u.kind === 'building' && u.key === b.id)} editMode={editMode} moveSel={moveSel} onBuildingClick={onBuildingClick} onCollect={onCollect} onCollectResource={onCollectResource} />
          ))}
          {activePlayers.map((p) => (
            <PlayerMarker key={p.id} player={p} />
          ))}
          {bonusOrbs.map((orb) => (
            <BonusOrbSprite key={orb.id} orb={orb} onOrbClick={onOrbClick} />
          ))}
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none transition-colors duration-1000" style={{ backgroundColor: ambient }} />
    </div>
  );
};
