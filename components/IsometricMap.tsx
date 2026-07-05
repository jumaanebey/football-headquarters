
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
  onMoveBuilding?: (id: string, gridX: number, gridY: number) => void;
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

// The ground is a floating turf island (Clash-style): mowed-lawn bands instead of a
// checkerboard, a thick soil skirt for depth, worn paths to the Stadium, and a soft
// light pool at the center.
const GroundLayerInner: React.FC<{ buildings: BuildingInstance[] }> = ({ buildings }) => {
  const tilePts = (gx: number, gy: number, s = 1) => {
    const c = tileToScreen(gx, gy);
    return `${c.x},${c.y - (TILE_H / 2) * s} ${c.x + (TILE_W / 2) * s},${c.y} ${c.x},${c.y + (TILE_H / 2) * s} ${c.x - (TILE_W / 2) * s},${c.y}`;
  };

  // Painted turf via ONE SVG <pattern> (5 image refs total, engine-tiled) — per-tile
  // <image> elements rasterize per frame and dropped the page to 2fps. Bands are cheap
  // flat overlays. (The light turf variant came back speckle-damaged; unused.)
  const bandShades = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      if (Math.floor((gx + gy) / 2) % 2 === 0) {
        bandShades.push(<polygon key={`b${gx}-${gy}`} points={tilePts(gx, gy)} fill="rgba(255,255,255,0.06)" />);
      }
    }
  }

  // Worn dirt paths: each building walks a manhattan route home to the Stadium.
  const stadium = buildings.find(b => b.type === BuildingType.STADIUM);
  const paths: JSX.Element[] = [];
  if (stadium) {
    const seen = new Set<string>();
    buildings.filter(b => b.id !== stadium.id).forEach(b => {
      let x = b.gridX, y = b.gridY;
      let guard = 0;
      while ((x !== stadium.gridX || y !== stadium.gridY) && guard++ < 24) {
        if (x !== stadium.gridX) x += x < stadium.gridX ? 1 : -1;
        else y += y < stadium.gridY ? 1 : -1;
        const k = `${x},${y}`;
        if (seen.has(k) || (x === stadium.gridX && y === stadium.gridY)) continue;
        seen.add(k);
        const pc = tileToScreen(x, y);
        // HTML <img> (GPU-composited) — NOT an SVG <image>; those rasterize per frame.
        paths.push(
          <img key={`p${k}`} src="/assets/ground/dirt-path-tile.png" alt="" draggable={false}
            style={{ position: 'absolute', left: pc.x - (TILE_W / 2) * 0.8, top: pc.y - (TILE_H / 2) * 0.8, width: TILE_W * 0.8, height: TILE_H * 0.8, maxWidth: 'none', opacity: 0.85, pointerEvents: 'none' }} />
        );
      }
    });
  }

  // Island skirt: soil faces extruded below the diamond's two lower edges.
  const D = 34;
  const cT = tileToScreen(0, 0), cR = tileToScreen(GRID - 1, 0), cB = tileToScreen(GRID - 1, GRID - 1), cL = tileToScreen(0, GRID - 1);
  const T = { x: cT.x, y: cT.y - TILE_H / 2 };
  const L = { x: cL.x - TILE_W / 2, y: cL.y }, B = { x: cB.x, y: cB.y + TILE_H / 2 }, R = { x: cR.x + TILE_W / 2, y: cR.y };
  const glow = stadium ? tileToScreen(stadium.gridX, stadium.gridY) : tileToScreen(6, 6);
  const eh = D + 22;
  const len = Math.hypot(B.x - L.x, B.y - L.y);
  const angL = Math.atan2(B.y - L.y, B.x - L.x) * 180 / Math.PI;
  const angR = Math.atan2(R.y - B.y, R.x - B.x) * 180 / Math.PI;

  return (
    <>
      <svg className="absolute inset-0 pointer-events-none" width={BOARD_W} height={BOARD_H} style={{ overflow: 'visible' }}>
        <defs>
          {/* Iso turf tiling as ONE pattern (center + 4 half-offset corner copies). */}
          <pattern id="turfPat" width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse"
            x={ORIGIN_X - TILE_W / 2} y={ORIGIN_Y - TILE_H / 2}>
            <image href="/assets/ground/turf-tile-dark.png" x={0} y={0} width={TILE_W} height={TILE_H} preserveAspectRatio="none" />
            <image href="/assets/ground/turf-tile-dark.png" x={-TILE_W / 2} y={-TILE_H / 2} width={TILE_W} height={TILE_H} preserveAspectRatio="none" />
            <image href="/assets/ground/turf-tile-dark.png" x={TILE_W / 2} y={-TILE_H / 2} width={TILE_W} height={TILE_H} preserveAspectRatio="none" />
            <image href="/assets/ground/turf-tile-dark.png" x={-TILE_W / 2} y={TILE_H / 2} width={TILE_W} height={TILE_H} preserveAspectRatio="none" />
            <image href="/assets/ground/turf-tile-dark.png" x={TILE_W / 2} y={TILE_H / 2} width={TILE_W} height={TILE_H} preserveAspectRatio="none" />
          </pattern>
          <radialGradient id="fieldGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* soil skirt base (under the painted edge strips) */}
        <polygon points={`${L.x},${L.y} ${B.x},${B.y} ${B.x},${B.y + D} ${L.x},${L.y + D}`} fill="#4a3826" />
        <polygon points={`${B.x},${B.y} ${R.x},${R.y} ${R.x},${R.y + D} ${B.x},${B.y + D}`} fill="#5c4630" />
        {/* the whole turf island as ONE pattern-filled polygon */}
        <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill="url(#turfPat)" />
        {bandShades}
        {/* turf lip highlight along the lower edges */}
        <polyline points={`${L.x},${L.y} ${B.x},${B.y} ${R.x},${R.y}`} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={2} />
        {/* soft light pool centered on the Stadium */}
        <ellipse cx={glow.x} cy={glow.y} rx={TILE_W * 4.2} ry={TILE_H * 4.2} fill="url(#fieldGlow)" />
      </svg>
      {/* Painted cliff edges + dirt paths as GPU-composited HTML imgs (never SVG <image>) */}
      <img src="/assets/ground/island-edge.png" alt="" draggable={false}
        style={{ position: 'absolute', left: L.x, top: L.y - 10, width: len, height: eh, maxWidth: 'none', transformOrigin: '0 0', transform: `rotate(${angL}deg)`, opacity: 0.95, pointerEvents: 'none' }} />
      <img src="/assets/ground/island-edge.png" alt="" draggable={false}
        style={{ position: 'absolute', left: B.x, top: B.y - 10, width: len, height: eh, maxWidth: 'none', transformOrigin: '0 0', transform: `rotate(${angR}deg)`, opacity: 0.95, pointerEvents: 'none' }} />
      {paths}
    </>
  );
};

// The terrain only changes when a building MOVES — memoize hard so the game loop's
// constant state ticks don't re-rasterize 100 SVG tile images every frame.
const GroundLayer = React.memo(GroundLayerInner, (prev, next) =>
  prev.buildings.length === next.buildings.length &&
  prev.buildings.every((b, i) => b.id === next.buildings[i].id && b.gridX === next.buildings[i].gridX && b.gridY === next.buildings[i].gridY)
);

/** Board-space (unscaled) point -> nearest grid cell, inverting the iso projection. */
const screenToTile = (bx: number, by: number) => {
  const a = (bx - ORIGIN_X) / (TILE_W / 2); // gx - gy
  const b = (by - ORIGIN_Y) / (TILE_H / 2); // gx + gy
  return { gx: Math.round((a + b) / 2), gy: Math.round((b - a) / 2) };
};

// Blocking Sled — smaller + alternately mirrored so a ring reads as a tidy fence
// line instead of a cluttered repeat of one big sprite.
const WallSprite: React.FC<{ gridX: number; gridY: number }> = ({ gridX, gridY }) => {
  const c = tileToScreen(gridX, gridY);
  const w = TILE_W * 0.6;
  const flip = (gridX + gridY) % 2 === 1;
  return (
    <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: gridX + gridY + 1 }}>
      <img src="/assets/battle/blocking-sled.png" alt="" draggable={false}
        style={{ position: 'absolute', width: w, maxWidth: 'none', height: 'auto', left: -w / 2, bottom: -TILE_H / 2 + 2, transform: flip ? 'scaleX(-1)' : undefined, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))', opacity: 0.96 }} />
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

export const IsometricMap: React.FC<Props> = ({ buildings, players, bonusOrbs, timeOfDay, recruitSlot, upgrades = [], walls = [], editMode = false, moveSel, onTileEdit, onMoveBuilding, onBuildingClick, onCollect, onCollectResource, onOrbClick }) => {
  const scale = useBoardScale();
  const boardRef = React.useRef<HTMLDivElement>(null);

  // --- Drag-and-drop building moves (Design mode) ---
  const [drag, setDrag] = useState<{ id: string; gx: number; gy: number; startGx: number; startGy: number } | null>(null);
  const dragMovedRef = React.useRef(false);

  const eventToTile = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = boardRef.current!.getBoundingClientRect();
    const bx = (e.clientX - rect.left) * BOARD_W / rect.width;
    const by = (e.clientY - rect.top) * BOARD_H / rect.height;
    return screenToTile(bx, by);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editMode || !boardRef.current) return;
    const { gx, gy } = eventToTile(e);
    const b = buildings.find(x => x.gridX === gx && x.gridY === gy);
    if (!b) return; // empty tile: leave click flow (wall toggle) alone
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic/edge pointers */ }
    dragMovedRef.current = false;
    setDrag({ id: b.id, gx, gy, startGx: gx, startGy: gy });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || !boardRef.current) return;
    const { gx, gy } = eventToTile(e);
    if (gx !== drag.gx || gy !== drag.gy) {
      dragMovedRef.current = true;
      setDrag(d => d ? { ...d, gx, gy } : d);
    }
  };

  const handlePointerUp = () => {
    if (!drag) return;
    if (dragMovedRef.current && (drag.gx !== drag.startGx || drag.gy !== drag.startGy)) {
      onMoveBuilding?.(drag.id, drag.gx, drag.gy);
    }
    setDrag(null);
  };

  const dragTileFree = drag
    ? drag.gx >= 0 && drag.gx < GRID && drag.gy >= 0 && drag.gy < GRID
      && !buildings.some(b => b.id !== drag.id && b.gridX === drag.gx && b.gridY === drag.gy)
      && !walls.some(w => w.gridX === drag.gx && w.gridY === drag.gy)
    : false;

  const night = timeOfDay < 6 || timeOfDay > 20;
  const dusk = (timeOfDay >= 6 && timeOfDay < 8) || (timeOfDay > 18 && timeOfDay <= 20);
  const ambient = night ? 'rgba(15,23,42,0.5)' : dusk ? 'rgba(251,146,60,0.16)' : 'rgba(0,0,0,0)';

  const sortedBuildings = [...buildings].sort((a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY));
  // Only render players who are heading to / at a drill.
  const activePlayers = players.filter(p => p.state !== PlayerState.IDLE);

  const handleBoardClick = (e: React.MouseEvent) => {
    if (!editMode || !onTileEdit || !boardRef.current) return;
    if (dragMovedRef.current) { dragMovedRef.current = false; return; } // a drag just ended — not a tap
    const { gx, gy } = eventToTile(e);
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
        <div ref={boardRef} onClick={handleBoardClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
          className={`relative ${editMode ? (drag ? 'cursor-grabbing' : 'cursor-pointer') : ''}`} style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${scale})`, transformOrigin: 'center', touchAction: editMode ? 'none' : undefined }}>
          <GroundLayer buildings={buildings} />
          {/* Drag ghost: green = drop OK, red = blocked */}
          {editMode && drag && (() => {
            const c = tileToScreen(drag.gx, drag.gy);
            const pts = `${c.x},${c.y - TILE_H / 2} ${c.x + TILE_W / 2},${c.y} ${c.x},${c.y + TILE_H / 2} ${c.x - TILE_W / 2},${c.y}`;
            return (
              <svg className="absolute inset-0 pointer-events-none" width={BOARD_W} height={BOARD_H} style={{ zIndex: 60, overflow: 'visible' }}>
                <polygon points={pts} fill={dragTileFree ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.4)'} stroke={dragTileFree ? '#4ade80' : '#f87171'} strokeWidth={3} strokeDasharray="8 5" />
              </svg>
            );
          })()}
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
