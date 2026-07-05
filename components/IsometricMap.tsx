
import React, { useState, useEffect } from 'react';
import { BuildingInstance, BuildingType, DrillState, Player, PlayerState, BonusOrb, UnitGroup, RecruitSlot, UpgradeJob, DefensePiece } from '../types';
import { BUILDING_INFO, VOXEL_CONFIG, COLLECTOR_CONFIG, collectorCap, DECOR, DEFENSE_TYPES } from '../constants';
import { planPath, BBuilding } from '../battle';
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
  defenses?: DefensePiece[];
  bus?: { gridX: number; gridY: number; flip?: boolean } | null;
  placing?: boolean; // a placement mode is armed — ground taps win over piece hit-boxes
  onTileEdit?: (gridX: number, gridY: number) => void;
  onPaintWall?: (gridX: number, gridY: number) => void; // drag across grass = lay a sled line
  onPaintStart?: () => void;                            // one undo entry per paint stroke
  externalGhost?: { gx: number; gy: number; ok: boolean } | null; // chip→board carry drop preview
  onMoveBuilding?: (id: string, gridX: number, gridY: number) => void;
  onMoveDefense?: (id: string, gridX: number, gridY: number) => void;
  onMoveBus?: (gridX: number, gridY: number) => void;
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

// Range-ring accents per equipment kind — matches each turret's battle personality.
const RING_COLOR: Record<string, string> = { jugs: '#fb923c', sled: '#f87171', ref: '#facc15', tshirt: '#f472b6' };

/** Board-space (unscaled) point -> nearest grid cell, inverting the iso projection.
 *  Exported so the App-level HUD can convert cursor positions for chip→board drags. */
export const screenToTile = (bx: number, by: number) => {
  const a = (bx - ORIGIN_X) / (TILE_W / 2); // gx - gy
  const b = (by - ORIGIN_Y) / (TILE_H / 2); // gx + gy
  return { gx: Math.round((a + b) / 2), gy: Math.round((b - a) / 2) };
};
export const BOARD_DIMS = { w: BOARD_W, h: BOARD_H };

// Team-colored fence — each segment orients to its neighbors so a ring reads as ONE
// connected barrier, not a repeat of a single sprite. The straight art's rail runs
// NE on screen (a gy-axis run); gx-axis runs get the same art mirrored. Isolated
// cells, corners, and junctions get the padded corner post.
const WallSprite: React.FC<{ gridX: number; gridY: number; wallKeys: Set<string> }> = ({ gridX, gridY, wallKeys }) => {
  const c = tileToScreen(gridX, gridY);
  const has = (dx: number, dy: number) => wallKeys.has(`${gridX + dx},${gridY + dy}`);
  const alongGx = has(1, 0) || has(-1, 0); // screen SE–NW run
  const alongGy = has(0, 1) || has(0, -1); // screen SW–NE run
  const isPost = alongGx === alongGy;      // isolated OR corner/junction
  const w = TILE_W * (isPost ? 0.5 : 1.0);
  return (
    <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: gridX + gridY + 1 }}>
      <img src={isPost ? '/assets/ground/fence-post.png' : '/assets/ground/fence-straight.png'} alt="" draggable={false}
        onError={e => { (e.currentTarget as HTMLImageElement).src = '/assets/battle/blocking-sled.png'; }}
        style={{ position: 'absolute', width: w, maxWidth: 'none', height: 'auto', left: -w / 2, bottom: isPost ? -TILE_H / 2 : -TILE_H, transform: alongGx && !isPost ? 'scaleX(-1)' : undefined, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))', opacity: 0.97 }} />
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
  dimmed?: boolean; // being dragged — the floating copy rides the cursor instead
  clickGuard?: React.MutableRefObject<boolean>;
  onBuildingClick: Props['onBuildingClick'];
  onCollect: Props['onCollect'];
  onCollectResource?: Props['onCollectResource'];
}> = ({ building, recruitSlot, upgradeJob, editMode, moveSel, dimmed, clickGuard, onBuildingClick, onCollect, onCollectResource }) => {
  const c = tileToScreen(building.gridX + 0.5, building.gridY + 0.5); // 2×2 footprint center
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
    if (clickGuard?.current) { clickGuard.current = false; return; } // this "click" was the tail of a drag
    const screenPos = { x: e.clientX, y: e.clientY };
    if (isCompleted) onCollect(building, screenPos);
    else onBuildingClick(building, screenPos);
  };

  const SPRITE_W = TILE_W * 1.9; // fills the 2×2 footprint — buildings finally OWN their 4 tiles

  return (
    <div className={`absolute group ${editMode ? '' : 'cursor-pointer'}`} style={{ left: c.x, top: c.y, zIndex: building.gridX + building.gridY + 6, pointerEvents: editMode ? 'none' : 'auto', opacity: dimmed ? 0.35 : 1 }} onClick={editMode ? undefined : handleClick}>
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

// Players appear on the field while training OR while patrolling the stadium (defenders).
const PlayerMarker: React.FC<{ player: Player }> = ({ player }) => {
  const c = worldToScreen(player.worldPos.x, player.worldPos.y);
  const isTraining = player.state === PlayerState.TRAINING;
  const isPatrolling = player.state === PlayerState.PATROLLING;

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
      {isPatrolling && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px]">🛡️</div>}
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

export const IsometricMap: React.FC<Props> = ({ buildings, players, bonusOrbs, timeOfDay, recruitSlot, upgrades = [], walls = [], defenses = [], bus = null, placing = false, editMode = false, moveSel, onTileEdit, onPaintWall, onPaintStart, onMoveBuilding, onMoveDefense, onMoveBus, onBuildingClick, onCollect, onCollectResource, onOrbClick, externalGhost = null }) => {
  const scale = useBoardScale();
  const boardRef = React.useRef<HTMLDivElement>(null);

  // --- Drag-and-drop for buildings, defense pieces, and the Team Bus ---
  // bx/by track the raw pointer in board space so the grabbed sprite RIDES the cursor.
  const [drag, setDrag] = useState<{ id: string; piece: 'building' | 'defense' | 'bus'; gx: number; gy: number; startGx: number; startGy: number; bx: number; by: number } | null>(null);
  const dragMovedRef = React.useRef(false);

  const eventToBoard = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return {
      bx: (e.clientX - rect.left) * BOARD_W / rect.width,
      by: (e.clientY - rect.top) * BOARD_H / rect.height,
    };
  };
  const eventToTile = (e: React.PointerEvent | React.MouseEvent) => {
    const { bx, by } = eventToBoard(e);
    return screenToTile(bx, by);
  };

  // VISUAL hit-testing: sprites are TALL, so mapping the pointer to a ground tile grabs
  // the tile BEHIND the art you clicked. Instead, test the pointer against each piece's
  // on-screen bounding box, front-most (highest gx+gy) first — what you see is what you grab.
  const pieceAtPoint = (bx: number, by: number): { id: string; piece: 'building' | 'defense' | 'bus'; gx: number; gy: number } | null => {
    type Hit = { id: string; piece: 'building' | 'defense' | 'bus'; gx: number; gy: number; w: number; h: number; cx: number; cy: number };
    const hits: Hit[] = [
      ...defenses.map(d => { const c = tileToScreen(d.gridX, d.gridY); return { id: d.id, piece: 'defense' as const, gx: d.gridX, gy: d.gridY, w: TILE_W * 0.92, h: TILE_W * 0.92, cx: c.x, cy: c.y + TILE_H / 2 }; }),
      ...(bus ? [(() => { const c = tileToScreen(bus.gridX, bus.gridY); return { id: 'team-bus', piece: 'bus' as const, gx: bus.gridX, gy: bus.gridY, w: TILE_W * 1.5, h: TILE_W * 1.1, cx: c.x, cy: c.y + TILE_H / 2 }; })()] : []),
      // Buildings hit-test over their FULL 2×2 art (center anchor, bottom = footprint's low vertex).
      ...buildings.map(b => { const c = tileToScreen(b.gridX + 0.5, b.gridY + 0.5); return { id: b.id, piece: 'building' as const, gx: b.gridX, gy: b.gridY, w: TILE_W * 1.9, h: TILE_W * 1.9, cx: c.x, cy: c.y + TILE_H }; }),
    ].sort((a, b) => (b.gx + b.gy) - (a.gx + a.gy)); // front-most first
    for (const p of hits) {
      if (bx >= p.cx - p.w / 2 && bx <= p.cx + p.w / 2 && by >= p.cy - p.h && by <= p.cy) return p;
    }
    return null;
  };

  // 🖌 Sled painting: pointerdown on empty grass in edit mode starts a stroke; every new
  // tile crossed lays a sled. A plain tap (no movement) still falls through to click-toggle.
  const paintRef = React.useRef<{ last: string; startGx: number; startGy: number; started: boolean } | null>(null);

  // DEFERRED GRAB: pressing a piece must NOT capture the pointer immediately — capture
  // retargets the eventual click to the board, silently eating taps on collect bubbles,
  // buildings, everything ("I can't click on anything"). The drag only becomes real (and
  // only then captures) once the pointer crosses into another tile.
  const pendingRef = React.useRef<{ id: string; piece: 'building' | 'defense' | 'bus'; gx: number; gy: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!boardRef.current) return; // drag works in BOTH view and Design mode
    const { bx, by } = eventToBoard(e);
    const hit = placing ? null : pieceAtPoint(bx, by);
    if (!hit) {
      // Empty ground: in edit mode (and not placing) this may become a paint stroke.
      if (editMode && !placing && onPaintWall) {
        const { gx, gy } = eventToTile(e);
        if (gx >= 0 && gx < GRID && gy >= 0 && gy < GRID) {
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
          dragMovedRef.current = false;
          paintRef.current = { last: `${gx},${gy}`, startGx: gx, startGy: gy, started: false };
        }
      }
      return; // single taps keep the click flow (wall toggle / placement)
    }
    dragMovedRef.current = false;
    pendingRef.current = hit; // arm — becomes a drag only if the pointer moves a tile
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!boardRef.current) return;
    // Pending grab crosses into another tile → NOW it's a drag (capture + ghost).
    if (pendingRef.current && !drag) {
      const { gx, gy } = eventToTile(e);
      const p = pendingRef.current;
      if (gx !== p.gx || gy !== p.gy) {
        try { boardRef.current.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
        const { bx, by } = eventToBoard(e);
        dragMovedRef.current = true;
        setDrag({ id: p.id, piece: p.piece, gx, gy, startGx: p.gx, startGy: p.gy, bx, by });
        pendingRef.current = null;
        return;
      }
    }
    if (paintRef.current && onPaintWall) {
      const { gx, gy } = eventToTile(e);
      if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) return;
      const key = `${gx},${gy}`;
      if (key !== paintRef.current.last) {
        if (!paintRef.current.started) {
          paintRef.current.started = true;
          onPaintStart?.();                                            // one undo entry per stroke
          onPaintWall(paintRef.current.startGx, paintRef.current.startGy); // don't skip the tile the stroke began on
        }
        dragMovedRef.current = true; // the pointer-up click is a stroke tail, not a tap
        onPaintWall(gx, gy);
        paintRef.current.last = key;
      }
      return;
    }
    if (!drag) return;
    const { bx, by } = eventToBoard(e);
    const { gx, gy } = eventToTile(e);
    if (gx !== drag.gx || gy !== drag.gy) dragMovedRef.current = true;
    setDrag(d => d ? { ...d, gx, gy, bx, by } : d); // sprite rides the cursor every move
  };

  const handlePointerUp = () => {
    paintRef.current = null;
    pendingRef.current = null;
    if (!drag) return;
    if (dragMovedRef.current && (drag.gx !== drag.startGx || drag.gy !== drag.startGy)) {
      if (drag.piece === 'defense') onMoveDefense?.(drag.id, drag.gx, drag.gy);
      else if (drag.piece === 'bus') onMoveBus?.(drag.gx, drag.gy);
      else onMoveBuilding?.(drag.id, drag.gx, drag.gy);
    }
    setDrag(null);
  };

  const dragMoved = !!drag && (drag.gx !== drag.startGx || drag.gy !== drag.startGy);
  const cellBlocked = (gx: number, gy: number, ignoreId: string) =>
    buildings.some(b => b.id !== ignoreId && gx >= b.gridX && gx <= b.gridX + 1 && gy >= b.gridY && gy <= b.gridY + 1)
    || walls.some(w => w.gridX === gx && w.gridY === gy)
    || defenses.some(x => x.id !== ignoreId && x.gridX === gx && x.gridY === gy)
    || !!(bus && ignoreId !== 'team-bus' && bus.gridX === gx && bus.gridY === gy);
  const dragTileFree = drag
    ? (drag.piece === 'building'
      ? drag.gx >= 0 && drag.gx <= GRID - 2 && drag.gy >= 0 && drag.gy <= GRID - 2
        && ![[0, 0], [1, 0], [0, 1], [1, 1]].some(([dx, dy]) => cellBlocked(drag.gx + dx, drag.gy + dy, drag.id))
      : drag.gx >= 0 && drag.gx < GRID && drag.gy >= 0 && drag.gy < GRID && !cellBlocked(drag.gx, drag.gy, drag.id))
    : false;

  // 🛣 Funnel lanes — memoized: patrolling players tick the game state ~10×/s, but the
  // lanes only change when walls, the bus, or the stadium move. 8 A* runs per EDIT, not per tick.
  const stadiumForLanes = buildings.find(b => b.type === BuildingType.STADIUM);
  const funnelLanes = React.useMemo(() => {
    if (!editMode || !stadiumForLanes) return null;
    const hq: BBuilding = { id: 'hq', kind: 'hq', x: stadiumForLanes.gridX * 10 + 5, y: stadiumForLanes.gridY * 10 + 5, hp: 1, maxHp: 1, size: 8, dead: false, cooldown: 0 };
    const obstacles: BBuilding[] = [
      ...walls.map((w, i) => ({ id: `w${i}`, kind: 'wall' as const, x: w.gridX * 10, y: w.gridY * 10, hp: 1, maxHp: 1, size: 4, dead: false, cooldown: 0 })),
      ...(bus ? [{ id: 'bus', kind: 'wall' as const, x: bus.gridX * 10, y: bus.gridY * 10, hp: 1, maxHp: 1, size: 6, dead: false, cooldown: 0 }] : []),
    ];
    const lanes: [number, number][] = [[0, 0], [90, 0], [0, 90], [90, 90], [45, 0], [0, 45], [90, 45], [45, 90]];
    return lanes.map(([sx, sy]) => {
      const plan = planPath(sx, sy, hq, [hq, ...obstacles]);
      const sealed = !!plan.targetWallId;
      const pts = [{ x: sx, y: sy }, ...plan.path]
        .map(p => { const c = worldToScreen(p.x, p.y); return `${c.x},${c.y}`; }).join(' ');
      const start = worldToScreen(sx, sy);
      return { pts, sealed, start };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, walls, bus?.gridX, bus?.gridY, bus == null, stadiumForLanes?.gridX, stadiumForLanes?.gridY]);

  const night = timeOfDay < 6 || timeOfDay > 20;
  const dusk = (timeOfDay >= 6 && timeOfDay < 8) || (timeOfDay > 18 && timeOfDay <= 20);
  const ambient = night ? 'rgba(15,23,42,0.5)' : dusk ? 'rgba(251,146,60,0.16)' : 'rgba(0,0,0,0)';

  const sortedBuildings = [...buildings].sort((a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY));
  // Only render players who are heading to / at a drill.
  const activePlayers = players.filter(p => p.state !== PlayerState.IDLE);

  const handleBoardClick = (e: React.MouseEvent) => {
    if (!editMode || !onTileEdit || !boardRef.current) return;
    if (dragMovedRef.current) { dragMovedRef.current = false; return; } // a drag just ended — not a tap
    // Taps on a piece's ART route to that piece's tile (visual hit-test); bare ground uses
    // the pointer tile. While PLACING, ground always wins (you're aiming at tiles, not pieces).
    if (!placing) {
      const { bx, by } = eventToBoard(e);
      const hit = pieceAtPoint(bx, by);
      if (hit) { onTileEdit(hit.gx, hit.gy); return; }
    }
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
        <div ref={boardRef} data-fhq-board onClick={handleBoardClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
          className={`relative ${drag ? 'cursor-grabbing' : editMode ? 'cursor-pointer' : ''}`} style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${scale})`, transformOrigin: 'center', touchAction: 'none' }}>
          <GroundLayer buildings={buildings} />
          {/* 🛣 FUNNEL OVERLAY (Design mode): the 8 attacker approach lanes, computed with
              the SAME pathfinder raiders use. RED = they walk in free (gap!), GREEN = your
              walls force a smash. Move a sled and watch the lanes react. */}
          {funnelLanes && (
            <svg className="absolute inset-0 pointer-events-none" width={BOARD_W} height={BOARD_H} style={{ zIndex: 55, overflow: 'visible' }}>
              {funnelLanes.map((l, li) => (
                <g key={li} opacity={l.sealed ? 0.4 : 0.75}>
                  {/* Accessibility: PATTERN carries the meaning (open = dashed, sealed = solid + lock) — color is reinforcement */}
                  <polyline points={l.pts} fill="none" stroke={l.sealed ? '#4ade80' : '#f87171'} strokeWidth={3.5} strokeDasharray={l.sealed ? undefined : '7 6'} strokeLinejoin="round" />
                  <circle cx={l.start.x} cy={l.start.y} r={9} fill={l.sealed ? '#4ade80' : '#f87171'} opacity={0.9} />
                  <text x={l.start.x} y={l.start.y + 4.5} textAnchor="middle" fontSize={12} fill="#0f172a" fontWeight={900}>{l.sealed ? '🔒' : '➜'}</text>
                </g>
              ))}
            </svg>
          )}
          {/* Drag ghost: green = drop OK, red = blocked */}
          {drag && (editMode || dragMoved) && (() => {
            const big = drag.piece === 'building'; // 2×2 footprint ghost
            const c = big ? tileToScreen(drag.gx + 0.5, drag.gy + 0.5) : tileToScreen(drag.gx, drag.gy);
            const hw = big ? TILE_W : TILE_W / 2, hh = big ? TILE_H : TILE_H / 2;
            const pts = `${c.x},${c.y - hh} ${c.x + hw},${c.y} ${c.x},${c.y + hh} ${c.x - hw},${c.y}`;
            // Dragging equipment? Show its coverage at the drop spot — position by RANGE, not vibes.
            const dKind = drag.piece === 'defense' ? defenses.find(x => x.id === drag.id)?.kind : null;
            const dType = dKind ? DEFENSE_TYPES.find(x => x.kind === dKind) : null;
            const rr = dType ? (dType.range / 10) * TILE_W * 0.55 : 0;
            return (
              <svg className="absolute inset-0 pointer-events-none" width={BOARD_W} height={BOARD_H} style={{ zIndex: 60, overflow: 'visible' }}>
                {dType && <ellipse cx={c.x} cy={c.y} rx={rr} ry={rr / 2} fill={`${RING_COLOR[dKind!] ?? '#f87171'}26`} stroke={RING_COLOR[dKind!] ?? '#f87171'} strokeWidth={2} strokeDasharray="6 5" />}
                <polygon points={pts} fill={dragTileFree ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.4)'} stroke={dragTileFree ? '#4ade80' : '#f87171'} strokeWidth={3} strokeDasharray="8 5" />
              </svg>
            );
          })()}
          {/* Drop preview for a chip/shop piece being carried in from the HUD */}
          {externalGhost && (() => {
            const c = tileToScreen(externalGhost.gx, externalGhost.gy);
            const pts = `${c.x},${c.y - TILE_H / 2} ${c.x + TILE_W / 2},${c.y} ${c.x},${c.y + TILE_H / 2} ${c.x - TILE_W / 2},${c.y}`;
            return (
              <svg className="absolute inset-0 pointer-events-none" width={BOARD_W} height={BOARD_H} style={{ zIndex: 60, overflow: 'visible' }}>
                <polygon points={pts} fill={externalGhost.ok ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.4)'} stroke={externalGhost.ok ? '#4ade80' : '#f87171'} strokeWidth={3} strokeDasharray="8 5" />
              </svg>
            );
          })()}
          {/* The grabbed piece RIDES the cursor — drag feels like holding the thing */}
          {drag && (editMode || dragMoved) && (() => {
            let src = ''; let w = TILE_W;
            if (drag.piece === 'building') {
              const b = buildings.find(x => x.id === drag.id);
              if (b) { src = buildingSprite(b.type, b.level); w = TILE_W * 1.7; }
            } else if (drag.piece === 'defense') {
              const d = defenses.find(x => x.id === drag.id);
              const t = d && DEFENSE_TYPES.find(x => x.kind === d.kind);
              if (t) { src = t.sprite; w = TILE_W * 0.85; }
            } else { src = '/assets/decor/team-bus.png'; w = TILE_W * 1.35; }
            if (!src) return null;
            return (
              <img src={src} alt="" draggable={false} className="absolute pointer-events-none"
                style={{ left: drag.bx - w / 2, top: drag.by - w * 0.75, width: w, maxWidth: 'none', height: 'auto', zIndex: 200, opacity: 0.9, filter: 'drop-shadow(0 12px 10px rgba(0,0,0,0.5))', transform: 'scale(1.05)' }} />
            );
          })()}
          {DECOR.map((d) => (
            <DecorSprite key={d.slug} slug={d.slug} gridX={d.gridX} gridY={d.gridY} scale={d.scale} />
          ))}
          {(() => {
            const wallKeys = new Set(walls.map(w => `${w.gridX},${w.gridY}`));
            return walls.map((w, i) => (
              <WallSprite key={`w${i}-${w.gridX}-${w.gridY}`} gridX={w.gridX} gridY={w.gridY} wallKeys={wallKeys} />
            ));
          })()}
          {/* Placed defensive equipment (draggable; kind-colored range rings while designing) */}
          {defenses.map(d => {
            const t = DEFENSE_TYPES.find(x => x.kind === d.kind) ?? DEFENSE_TYPES[0];
            const c = tileToScreen(d.gridX, d.gridY);
            const w = TILE_W * 0.92;
            const rx = (t.range / 10) * TILE_W * 0.55;
            const ring = RING_COLOR[d.kind] ?? '#f87171';
            return (
              <div key={d.id} className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: d.gridX + d.gridY + 4, opacity: drag?.id === d.id ? 0.45 : 1 }}>
                {editMode && (
                  <div className="absolute rounded-full" style={{ left: -rx, top: -rx / 2, width: rx * 2, height: rx, border: `2px dashed ${ring}99`, background: `${ring}1a`, boxShadow: `inset 0 0 12px ${ring}22` }} />
                )}
                <img src={t.sprite} alt={t.name} draggable={false}
                  style={{ position: 'absolute', width: w, maxWidth: 'none', height: 'auto', left: -w / 2, bottom: -TILE_H / 2 - 2, transform: d.flip ? 'scaleX(-1)' : undefined, filter: 'drop-shadow(0 5px 5px rgba(0,0,0,0.35))' }} />
              </div>
            );
          })}
          {/* The Team Bus — a movable BIG blocker (drag to park a lane shut; tap to rotate) */}
          {bus && (() => {
            const c = tileToScreen(bus.gridX, bus.gridY);
            const w = TILE_W * 1.5;
            return (
              <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: bus.gridX + bus.gridY + 4, opacity: drag?.id === 'team-bus' ? 0.45 : 1 }}>
                <img src="/assets/decor/team-bus.png" alt="Team Bus" draggable={false}
                  style={{ position: 'absolute', width: w, maxWidth: 'none', height: 'auto', left: -w / 2, bottom: -TILE_H / 2, transform: bus.flip ? 'scaleX(-1)' : undefined, filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.35))' }} />
              </div>
            );
          })()}
          {sortedBuildings.map((b) => (
            <BuildingSprite key={b.id} building={b} dimmed={drag?.piece === 'building' && drag.id === b.id} recruitSlot={recruitSlot} upgradeJob={upgrades.find(u => u.kind === 'building' && u.key === b.id)} editMode={editMode} moveSel={moveSel} clickGuard={dragMovedRef} onBuildingClick={onBuildingClick} onCollect={onCollect} onCollectResource={onCollectResource} />
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
