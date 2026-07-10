
import React, { useState, useEffect } from 'react';
import { BuildingInstance, BuildingType, DrillState, Player, PlayerState, BonusOrb, UnitGroup, RecruitSlot, UpgradeJob } from '../types';
import { BUILDING_INFO, VOXEL_CONFIG, COLLECTOR_CONFIG, collectorCap, DECOR, HOME_DISPLAY_ANCHORS } from '../constants';
import { buildingSprite, unitPlayerSprite } from '../assets';
import { Check, Star, Dumbbell, Search, Coins, Hammer } from 'lucide-react';

// ─── BUILD VIEW ────────────────────────────────────────────────────────────────
// The home board is pure management: facilities, decor, and your players. The
// defensive layer (walls, emplacements, bus, parking apron) renders ONLY in the
// defense view (BattleScreen) — see FIXED-BASE-PLAN.md. Positions are fixed
// geometry (fixedBase.ts): there is no placement, painting, or dragging here.

interface Props {
  buildings: BuildingInstance[];
  players: Player[];
  bonusOrbs: BonusOrb[];
  timeOfDay: number; // 0-24
  recruitSlot?: RecruitSlot | null;
  upgrades?: UpgradeJob[];
  formationName?: string; // current defensive scheme — shown as a pennant so switching visibly changes the board
  rankColor?: string;      // 🎖 RANK SKIN: trophy tier tints the board (light pool, flags)
  selectedId?: string | null;          // CC-style selection: spotlight under this building
  celebrationId?: string | null;       // 🎉 upgrade just finished here — burst + LEVEL UP!
  onDeselect?: () => void;             // tap empty turf → clear the selection
  rankName?: string;
  trophies?: number;
  fans?: number;
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
// Painted grounds features as CORNER RECTS — the layout editor (?edit=1) drags these
// corners live, so they're props with the shipped geometry as defaults.
type GroundRect = { x1: number; y1: number; x2: number; y2: number };
const FIELD_RECT: GroundRect = { x1: -6.6, y1: 1.9, x2: -1.3, y2: 9.1 };
const ROAD_RECT: GroundRect = { x1: 9.9, y1: 7.0, x2: 16.5, y2: 8.3 };
const GroundLayerInner: React.FC<{ buildings: BuildingInstance[]; field?: GroundRect; road?: GroundRect }> = ({ buildings, field = FIELD_RECT, road = ROAD_RECT }) => {
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

  // NO MORE FLOATING ISLAND: the campus sits on a wide grounds plane that fades into
  // the night instead of dropping off a cliff into space (user call, July 2026).
  const cT = tileToScreen(0, 0), cR = tileToScreen(GRID - 1, 0), cB = tileToScreen(GRID - 1, GRID - 1), cL = tileToScreen(0, GRID - 1);
  const T = { x: cT.x, y: cT.y - TILE_H / 2 };
  const L = { x: cL.x - TILE_W / 2, y: cL.y }, B = { x: cB.x, y: cB.y + TILE_H / 2 }, R = { x: cR.x + TILE_W / 2, y: cR.y };
  const glow = stadium ? tileToScreen(stadium.gridX, stadium.gridY) : tileToScreen(6, 6);
  // Surrounding grounds: the same diamond scaled up ~2x about its center — reads as
  // the dark practice fields beyond the mowed campus, vignetting out to the backdrop.
  const CX = (T.x + B.x) / 2, CY = (T.y + B.y) / 2, K = 4.2; // big enough that the plane owns the whole viewport at any legal zoom
  const OP = [T, R, B, L].map(p => `${CX + (p.x - CX) * K},${CY + (p.y - CY) * K}`).join(' ');

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
          {/* Outer grounds: dark grass near the campus, deepening outward — NEVER
              transparent (transparent rim = black space, user hated it). The far
              stop matches the backdrop greens so the rim is invisible. */}
          <radialGradient id="outerGround" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#16351f" stopOpacity="1" />
            <stop offset="30%" stopColor="#122c1d" stopOpacity="1" />
            <stop offset="65%" stopColor="#0d2316" stopOpacity="1" />
            <stop offset="100%" stopColor="#081711" stopOpacity="1" />
          </radialGradient>
        </defs>
        {/* the grounds BEYOND the campus — same iso plane, scaled up, vignetted out */}
        <polygon points={OP} fill="url(#outerGround)" />
        {/* PRACTICE FIELD on the west grounds: full-size second field (bigger per
            Jumaane's markup), real turf, end zones, yard stripes */}
        {(() => {
          const FX1 = field.x1, FX2 = field.x2, FY1 = field.y1, FY2 = field.y2;
          // end zones / mow bands as FRACTIONS of the field length, so the rect can
          // be moved or resized (editor) without the paint drifting off it
          const fy = (t: number) => FY1 + (FY2 - FY1) * t;
          const fc = (gy1: number, gy2: number) => {
            const a = tileToScreen(FX1, gy1), b = tileToScreen(FX2, gy1), c = tileToScreen(FX2, gy2), d = tileToScreen(FX1, gy2);
            return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
          };
          const fT = tileToScreen(FX1, FY1), fR = tileToScreen(FX2, FY1), fB = tileToScreen(FX2, FY2), fL = tileToScreen(FX1, FY2);
          const stripes = [];
          for (let i = 1; i < 8; i++) {
            const t = i / 8;
            const ax = fT.x + (fL.x - fT.x) * t, ay = fT.y + (fL.y - fT.y) * t;
            const bx = fR.x + (fB.x - fR.x) * t, by = fR.y + (fB.y - fR.y) * t;
            stripes.push(<line key={`pf${i}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} />);
          }
          return (
            <g>
              {/* brighter than the rough by a clear step — on real screens the old
                  #1c4729 read as a black void with lines (prod screenshot, Jul 10) */}
              <polygon points={fc(FY1, FY2)} fill="#265934" />
              {/* mow bands */}
              <polygon points={fc(fy(0.18), fy(0.36))} fill="rgba(255,255,255,0.07)" />
              <polygon points={fc(fy(0.54), fy(0.72))} fill="rgba(255,255,255,0.07)" />
              {/* end zones */}
              <polygon points={fc(FY1, fy(0.125))} fill="rgba(249,115,22,0.32)" />
              <polygon points={fc(fy(0.875), FY2)} fill="rgba(17,24,39,0.4)" />
              {stripes}
              <polygon points={fc(FY1, FY2)} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth={2} />
            </g>
          );
        })()}
        {/* ACCESS ROAD: asphalt across the SE rough — the parking lot fronts onto it */}
        {(() => {
          const a = tileToScreen(road.x1, road.y1), b = tileToScreen(road.x2, road.y1), c = tileToScreen(road.x2, road.y2), d = tileToScreen(road.x1, road.y2);
          const my = (road.y1 + road.y2) / 2;
          const m1 = tileToScreen(road.x1 + 0.3, my), m2 = tileToScreen(road.x2, my);
          return (
            <g>
              <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} fill="#20242b" opacity="0.9" />
              <line x1={m1.x} y1={m1.y} x2={m2.x} y2={m2.y} stroke="#c9a13b" strokeWidth={1.6} strokeDasharray="10 12" opacity="0.7" />
            </g>
          );
        })()}
        {/* the mowed campus as ONE pattern-filled polygon */}
        <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill="url(#turfPat)" />
        {bandShades}
        {/* boundary: a groundskeeper's line where the mowed campus meets the rough */}
        <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={2.5} />
        {/* soft light pool centered on the Stadium */}
        <ellipse cx={glow.x} cy={glow.y} rx={TILE_W * 4.2} ry={TILE_H * 4.2} fill="url(#fieldGlow)" />
      </svg>
      {/* GROUND INTEGRATION v2 (the shadow blobs read as smears — Jumaane): each
          facility stands on WORN TURF, laid from the same dirt-tile art the walking
          paths use, so the wear matches the campus's existing tan patches exactly.
          Footprint tiles wear hardest; entrance and edge tiles fade out. */}
      {buildings.map(b => {
        const spots: [number, number, number][] = [
          [0, 0, 0.9], [1, 0, 0.9], [0, 1, 0.9], [1, 1, 0.9], // the 2×2 footprint
          [1.7, 0.5, 0.55], [0.5, 1.7, 0.55], [1.6, 1.6, 0.65], // entrance wear, down-screen
          [-0.6, 0.5, 0.45], [0.5, -0.6, 0.45], // light wear peeking behind
        ];
        return spots.map(([dx, dy, op], i) => {
          const pc = tileToScreen(b.gridX + dx, b.gridY + dy);
          return <img key={`pad${b.id}-${i}`} src="/assets/ground/dirt-path-tile.png" alt="" draggable={false}
            style={{ position: 'absolute', left: pc.x - TILE_W / 2, top: pc.y - TILE_H / 2, width: TILE_W, height: TILE_H, maxWidth: 'none', opacity: op, pointerEvents: 'none' }} />;
        });
      })}
      {paths}
    </>
  );
};

// The terrain only changes when a building MOVES — memoize hard so the game loop's
// constant state ticks don't re-rasterize 100 SVG tile images every frame.
const GroundLayer = React.memo(GroundLayerInner, (prev, next) =>
  prev.buildings.length === next.buildings.length &&
  prev.buildings.every((b, i) => b.id === next.buildings[i].id && b.gridX === next.buildings[i].gridX && b.gridY === next.buildings[i].gridY) &&
  prev.field === next.field && prev.road === next.road
);

/** Board-space (unscaled) point -> nearest grid cell, inverting the iso projection. */
export const screenToTile = (bx: number, by: number) => {
  const a = (bx - ORIGIN_X) / (TILE_W / 2); // gx - gy
  const b = (by - ORIGIN_Y) / (TILE_H / 2); // gx + gy
  return { gx: Math.round((a + b) / 2), gy: Math.round((b - a) / 2) };
};
export const BOARD_DIMS = { w: BOARD_W, h: BOARD_H };

const DecorSprite: React.FC<{ slug: string; gridX: number; gridY: number; scale: number; flip?: boolean; z?: number }> = ({ slug, gridX, gridY, scale, flip, z }) => {
  const c = tileToScreen(gridX, gridY);
  const w = TILE_W * 1.35 * scale;
  // Outer-grounds props sit at out-of-grid coords whose row sum can go negative —
  // clamp so they never stack UNDER the ground plane itself. `flip` mirrors the art
  // so directional props (grandstand seating) can face the other iso quadrant.
  return (
    <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: Math.max(1, Math.round(z ?? gridX + gridY)) }}>
      <img src={`/assets/decor/${slug}.png`} alt="" draggable={false}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        style={{ position: 'absolute', width: w, maxWidth: 'none', height: 'auto', left: -w / 2, bottom: -TILE_H / 2, transform: flip ? 'scaleX(-1)' : undefined, filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.3))' }} />
    </div>
  );
};

// 🔍 DEBUG GRID (?grid=1): iso tile lines + (col,row) labels + compass, so layout
// requests can be given as exact tile coordinates instead of "top-left-ish".
// Campus tiles 0..9 draw solid with every label; outer grounds draw dashed with
// every-2nd labels. Pure overlay — pointer-events none, zIndex above everything.
const URL_PARAMS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
// 🛠 ?edit=1 → the LAYOUT EDITOR (drag handles + export panel); it implies the grid.
const EDIT_ON = !!URL_PARAMS?.has('edit');
const GRID_ON = !!URL_PARAMS?.has('grid') || EDIT_ON;
const GridOverlay: React.FC = () => {
  const LO = -10, HI = 18;
  const lines: JSX.Element[] = [];
  for (let i = LO; i <= HI; i++) {
    const a1 = tileToScreen(i - 0.5, LO - 0.5), a2 = tileToScreen(i - 0.5, HI + 0.5);
    const b1 = tileToScreen(LO - 0.5, i - 0.5), b2 = tileToScreen(HI + 0.5, i - 0.5);
    const onCampus = i >= 0 && i <= 10;
    lines.push(<line key={`gx${i}`} x1={a1.x} y1={a1.y} x2={a2.x} y2={a2.y} stroke={onCampus ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)'} strokeWidth={1} strokeDasharray={onCampus ? undefined : '4 6'} />);
    lines.push(<line key={`gy${i}`} x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} stroke={onCampus ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)'} strokeWidth={1} strokeDasharray={onCampus ? undefined : '4 6'} />);
  }
  const labels: JSX.Element[] = [];
  for (let gx = LO; gx <= HI - 1; gx++) for (let gy = LO; gy <= HI - 1; gy++) {
    const onCampus = gx >= 0 && gx <= 9 && gy >= 0 && gy <= 9;
    if (!onCampus && (gx % 2 !== 0 || gy % 2 !== 0)) continue;
    const c = tileToScreen(gx, gy);
    labels.push(<text key={`t${gx},${gy}`} x={c.x} y={c.y + 3} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={onCampus ? 'rgba(255,255,150,0.85)' : 'rgba(255,255,255,0.4)'}>{gx},{gy}</text>);
  }
  return (
    <>
      <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, width: BOARD_W, height: BOARD_H, overflow: 'visible', zIndex: 500 }}>
        {lines}{labels}
      </svg>
      <div className="absolute pointer-events-none font-mono text-[11px] leading-tight text-white bg-black/70 rounded px-2 py-1" style={{ left: 8, top: 8, zIndex: 501 }}>
        GRID (col,row) · +col ↘ down-right · +row ↙ down-left<br />campus = 0..9 solid · grounds dashed
      </div>
    </>
  );
};

// 🏃 PRACTICE SQUAD: tiny players shuttle-running drills on the outer practice field.
// Pure ambience — CSS-driven out-and-back routes (fhq-drill w/ per-runner --dx/--dy),
// facing flips at the turn, existing unit walk frames do the legs. No game state.
const DRILL_SQUAD: { slug: string; gx: number; gy: number; dgy: number; dur: number; delay: number; rev?: boolean }[] = [
  { slug: 'offensive-line', gx: -5.6, gy: 2.7, dgy: 5.8, dur: 13.5, delay: 0 },
  { slug: 'skill-positions', gx: -4.4, gy: 2.9, dgy: 5.4, dur: 10, delay: -3.2 },
  { slug: 'defensive-line', gx: -3.2, gy: 2.6, dgy: 6.0, dur: 14.5, delay: -7.1 },
  { slug: 'secondary', gx: -4.9, gy: 8.6, dgy: -5.7, dur: 11, delay: -1.6, rev: true },
];

// 🟠 LIVE JUMBOTRON: the scoreboard prop promoted to a real scoreboard — the club's
// trophies and fan count burn on its LED face (HTML overlay skewed to the panel).
// VEGAS SIZE per Jumaane: a mega-board towering BEHIND the practice field's north
// end zone (up-screen = behind in iso), dwarfing everything around it.
// Shipped scoreboard anchor — the editor overrides these via props.
// (3.5, -2) per Jumaane's editor layout, July 10 2026.
const BOARD_ANCHOR = { gx: 3.5, gy: -2, w: 3.2 };
const Jumbotron: React.FC<{ trophies?: number; fans?: number; gx?: number; gy?: number; wMult?: number }> = ({ trophies, fans, gx = BOARD_ANCHOR.gx, gy = BOARD_ANCHOR.gy, wMult = BOARD_ANCHOR.w }) => {
  // BOARD diagonal BEHIND THE WAR ROOM (Jumaane): ribbon-board art (wide panel,
  // short blocks) sloping down-right along the campus's upper-right edge. Width is
  // the honest max that keeps the panel inside the frame at the default camera —
  // iso slope means any wide panel is also tall, so the sky budget rules here.
  const c = tileToScreen(gx, gy);
  const w = TILE_W * wMult;
  const fmt = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
  return (
    <div className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: 1 }}>
      <div style={{ position: 'absolute', width: w, height: w * 1.02, left: -w / 2, bottom: -TILE_H / 2 }}>
        <img src="/assets/decor/ribbonboard.png" alt="" draggable={false}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 6px rgba(0,0,0,0.3))' }} />
        {/* LED face — rotated onto the panel at the iso angle; values pop on change */}
        {trophies !== undefined && (
          <div className="absolute flex flex-col items-center justify-center gap-[4%]"
            style={{ left: '33%', top: '25%', width: '32%', height: '26%', transform: 'rotate(26.5deg)', transformOrigin: '0 0', animation: 'fhq-ledflicker 3.4s ease-in-out infinite' }}>
            <div key={`t${trophies}`} className="font-mono font-black leading-none" style={{ fontSize: w * 0.046, color: '#fdba74', textShadow: '0 0 6px rgba(249,115,22,0.9), 0 0 14px rgba(249,115,22,0.5)', animation: 'fhq-counter-pop 0.55s ease-out' }}>🏆{fmt(trophies)}</div>
            <div key={`f${fans}`} className="font-mono font-black leading-none" style={{ fontSize: w * 0.04, color: '#fed7aa', textShadow: '0 0 5px rgba(249,115,22,0.8)', animation: 'fhq-counter-pop 0.55s ease-out' }}>👥{fmt(fans ?? 0)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const DrillRunner: React.FC<typeof DRILL_SQUAD[number]> = ({ slug, gx, gy, dgy, dur, delay, rev }) => {
  const a = tileToScreen(gx, gy), b = tileToScreen(gx, gy + dgy);
  const rigOn = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.dataset.rig = '1'; };
  const rigOff = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.removeAttribute('data-rig'); };
  return (
    <div className="fhq-drillsquad absolute pointer-events-none"
      style={{ left: a.x, top: a.y, zIndex: 2, '--dx': `${b.x - a.x}px`, '--dy': `${b.y - a.y}px`, animation: `fhq-drill ${dur}s linear ${delay}s infinite` } as React.CSSProperties}>
      {/* anchor wrapper carries the static centering — the flip wrapper's animation
          would otherwise stomp it (animation transform replaces static transform) */}
      <div className="absolute" style={{ left: -13, top: -28, width: 26, height: 30 }}>
        <div className="fhq-unit relative w-full h-full" style={{ animation: `${rev ? 'fhq-drillflip-r' : 'fhq-drillflip'} ${dur}s linear ${delay}s infinite` }}>
          <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30" style={{ bottom: -2, width: 17, height: 6 }} />
          <img src={`/assets/units/${slug}-player.png`} alt="" draggable={false}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            className="fhq-flat absolute inset-0 w-full h-full object-contain" />
          {(['walkA', 'walkC', 'walkB', 'walkD'] as const).map((fr, qi) => (
            <img key={fr} src={`/assets/units/${slug}-${fr}.png`} alt="" draggable={false} onLoad={rigOn} onError={rigOff}
              className="absolute inset-0 w-full h-full object-contain" style={{ animation: `fhq-q${qi + 1} 0.42s linear infinite` }} />
          ))}
        </div>
      </div>
    </div>
  );
};

// The grounds AROUND the campus: practice-field bleachers, the scoreboard over the
// north-east rough, and the team bus at its parking pad. Pure set dressing — outside
// the buildable grid, missing art self-hides (DecorSprite onError).
// JUMAANE'S LAYOUT (July 10, 2026) — arranged by hand in the ?edit=1 editor on the
// live site and transplanted verbatim from its export. Future layout rounds should
// follow the same flow: edit → COPY LAYOUT CODE → paste → transplant.
const OUTER_DECOR: { slug: string; gridX: number; gridY: number; scale: number; flip?: boolean; z?: number }[] = [
  { slug: 'grandstand', gridX: -5.5, gridY: 6,  scale: 3, flip: true },
  { slug: 'grandstand', gridX: -5.5, gridY: 10, scale: 3, flip: true },
  { slug: 'parking-lot', gridX: 14.5, gridY: 4.5, scale: 3.1 },
  { slug: 'team-bus',    gridX: 13, gridY: 7, scale: 1.5, flip: true, z: 23 }, // parked on the road, nose west
  { slug: 'goalpost', gridX: -3.95, gridY: 1.7, scale: 0.95 },
  { slug: 'goalpost', gridX: -3.95, gridY: 9.35, scale: 0.95 },
  { slug: 'floodlight', gridX: -7.3, gridY: 1.3,  scale: 2.1 },
  { slug: 'floodlight', gridX: -6,   gridY: 11.5, scale: 2.1 },
  { slug: 'floodlight', gridX: -0.7, gridY: 2.1,  scale: 2.1 },
  { slug: 'floodlight', gridX: -0.9, gridY: 11.2, scale: 2.1 },
  { slug: 'tree-cluster', gridX: -4.5, gridY: -0.5, scale: 1.4 },
  { slug: 'tree-cluster', gridX: 13.5, gridY: 12,   scale: 1.35 },
  { slug: 'tree-cluster', gridX: -6.5, gridY: 0,    scale: 1.25 },
  { slug: 'tree-cluster', gridX: 7.5,  gridY: -2.5, scale: 1.2 },
  { slug: 'tree-cluster', gridX: 9.5,  gridY: 14.5, scale: 1.35 },
  { slug: 'tree-cluster', gridX: 13.3, gridY: -1,   scale: 1.15 },
  { slug: 'tree-cluster', gridX: 13.5, gridY: 9.6,  scale: 1.5 },
  { slug: 'tree-cluster', gridX: 12,   gridY: 13.5, scale: 1.25 },
  { slug: 'tree-cluster', gridX: 7.2,  gridY: 12.3, scale: 1.5 },
  { slug: 'tree-cluster', gridX: 3,    gridY: 11.8, scale: 1.25 },
  { slug: 'tree-cluster', gridX: -1.5, gridY: 12.5, scale: 1.4 },
  { slug: 'tree-cluster', gridX: -4,   gridY: 12.5, scale: 1.25 },
  { slug: 'tree-cluster', gridX: -7,   gridY: 12,   scale: 1.4 },
  { slug: 'tree-cluster', gridX: 10.4, gridY: -0.6, scale: 1.25 },
];

// ─── 🛠 LAYOUT EDITOR (?edit=1) ────────────────────────────────────────────────
// Every piece gets a drag handle that SNAPS to the tile grid; a panel exports the
// whole layout as paste-ready code. Edits live in localStorage (this browser only)
// and never touch game state — arrange, hit COPY, hand the block to Claude to ship.
type OuterItem = { slug: string; gridX: number; gridY: number; scale: number; flip?: boolean; z?: number };
type EditLayout = {
  v: number;
  outer: OuterItem[];
  campus: { slug: string; gridX: number; gridY: number; scale: number }[];
  board: { gx: number; gy: number; w: number };
  field: GroundRect;
  road: GroundRect;
  buildings: Partial<Record<BuildingType, { gx: number; gy: number }>>;
};
type SelRef =
  | { kind: 'outer'; i: number }
  | { kind: 'campus'; i: number }
  | { kind: 'board' }
  | { kind: 'bldg'; t: BuildingType }
  | { kind: 'field'; c: 0 | 1 }
  | { kind: 'road'; c: 0 | 1 };

const EDIT_LS_KEY = 'fhq_layout_edit_v1';
const r2 = (n: number) => Math.round(n * 100) / 100;
const freshEditLayout = (): EditLayout => ({
  v: 1,
  outer: OUTER_DECOR.map(d => ({ ...d })),
  campus: DECOR.map(d => ({ ...d })),
  board: { ...BOARD_ANCHOR },
  field: { ...FIELD_RECT },
  road: { ...ROAD_RECT },
  buildings: {},
});
const loadEditLayout = (): EditLayout => {
  try {
    const raw = localStorage.getItem(EDIT_LS_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && p.v === 1 && Array.isArray(p.outer) && Array.isArray(p.campus) && p.board && p.field && p.road && p.buildings) return p; }
  } catch { /* fall through to fresh */ }
  return freshEditLayout();
};
const saveEditLayout = (l: EditLayout) => { try { localStorage.setItem(EDIT_LS_KEY, JSON.stringify(l)); } catch { /* storage full/blocked — edits just won't persist */ } };

const genLayoutExport = (l: EditLayout, bldgs: BuildingInstance[]) => {
  const f = (n: number) => `${r2(n)}`;
  const lines: string[] = [
    '// ── FHQ LAYOUT EXPORT (?edit=1) — paste this whole block to Claude ──',
    '',
    '// components/IsometricMap.tsx → OUTER_DECOR:',
    'const OUTER_DECOR = [',
    ...l.outer.map(d => `  { slug: '${d.slug}', gridX: ${f(d.gridX)}, gridY: ${f(d.gridY)}, scale: ${f(d.scale)}${d.flip ? ', flip: true' : ''}${d.z !== undefined ? `, z: ${d.z}` : ''} },`),
    '];',
    '',
    '// constants.ts → DECOR (campus):',
    'const DECOR = [',
    ...l.campus.map(d => `  { slug: '${d.slug}', gridX: ${f(d.gridX)}, gridY: ${f(d.gridY)}, scale: ${f(d.scale)} },`),
    '];',
    '',
    `// Scoreboard (ribbonboard): anchor (${f(l.board.gx)}, ${f(l.board.gy)}), width TILE_W * ${f(l.board.w)}`,
    `// Practice field: cols ${f(l.field.x1)} → ${f(l.field.x2)}, rows ${f(l.field.y1)} → ${f(l.field.y2)}`,
    `// Access road: cols ${f(l.road.x1)} → ${f(l.road.x2)}, rows ${f(l.road.y1)} → ${f(l.road.y2)}`,
    '// Building display anchors (constants.ts HOME_DISPLAY_ANCHORS — home view only;',
    '// battle geometry lives in fixedBase.ts FORMATIONS):',
    ...bldgs.map(b => `//   ${b.type}: (${b.gridX}, ${b.gridY})${l.buildings[b.type] ? '  ← MOVED' : ''}`),
  ];
  return lines.join('\n');
};

const EditMarker: React.FC<{
  gx: number; gy: number; color: string; label: string; sel: boolean;
  onDown: (e: React.PointerEvent) => void; onMove: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void;
}> = ({ gx, gy, color, label, sel, onDown, onMove, onUp }) => {
  const c = tileToScreen(gx, gy);
  return (
    <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={e => e.stopPropagation()} title={label}
      style={{ position: 'absolute', left: c.x - 8, top: c.y - 8, width: 16, height: 16, zIndex: 640, cursor: 'grab', borderRadius: '50%', background: color, border: sel ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.7)', boxShadow: '0 1px 5px rgba(0,0,0,0.7)', pointerEvents: 'auto', touchAction: 'none' }}>
      {sel && (
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 10, fontFamily: 'monospace', color: '#fff', background: 'rgba(0,0,0,0.8)', padding: '1px 6px', borderRadius: 4, pointerEvents: 'none' }}>{label}</div>
      )}
    </div>
  );
};

const BuildingSprite: React.FC<{
  building: BuildingInstance;
  recruitSlot?: RecruitSlot | null;
  upgradeJob?: UpgradeJob;
  clickGuard?: React.MutableRefObject<boolean>;
  onBuildingClick: Props['onBuildingClick'];
  onCollect: Props['onCollect'];
  onCollectResource?: Props['onCollectResource'];
  selected?: boolean;
  celebrating?: boolean;
}> = ({ building, recruitSlot, upgradeJob, clickGuard, onBuildingClick, onCollect, onCollectResource, selected, celebrating }) => {
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
  // The bubble is an INDICATOR, not a separate button — tapping the BUILDING collects.
  // Collect floor is a flat 30: at higher levels the old cap-based threshold left up to
  // ~225 coins in an uncollectable dead zone where taps opened the modal instead (TASK-1).
  const collectReady = !!collectorCfg && banked >= 30;
  const bubbleReady = !!collectorCfg && banked >= Math.max(30, cap * 0.25); // bounce = storage filling
  const showBubble = collectReady;

  // A building is "actionable" (glowing) when there's something to tap.
  const actionable = isCompleted || recruitReady || bubbleReady;

  let progress = 0;
  if (isActive && building.startTime && building.finishTime) {
    progress = Math.max(0, Math.min(1, (Date.now() - building.startTime) / (building.finishTime - building.startTime)));
  }

  // ONE tap, one behavior: collect whatever's ready (drill or coins), otherwise open
  // the building. No separate hit-targets fighting each other on the same sprite.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // board-level tap-away must not fire for building taps
    if (clickGuard?.current) { clickGuard.current = false; return; } // this "click" was the tail of a pan
    const screenPos = { x: e.clientX, y: e.clientY };
    if (isCompleted) onCollect(building, screenPos);
    else if (collectReady) onCollectResource?.(building, screenPos);
    else onBuildingClick(building, screenPos);
  };

  const SPRITE_W = TILE_W * 2.3; // renders ~15% past the 2×2 footprint — proportion pass (Jumaane: buildings read small vs field/lot); footprint & anchors unchanged

  // 🌆 DUSK PASS: the backdrop is permanently stadium-night, so windows are ALWAYS lit —
  // warm glow blobs (screen-blended, slow breathe) at each art's window/light zones.
  // Fractions of SPRITE_W: x from sprite left, y up from sprite base.
  const WINDOW_GLOWS: Partial<Record<BuildingType, { x: number; y: number; w: number }[]>> = {
    [BuildingType.STADIUM]:        [{ x: 0.28, y: 0.30, w: 0.44 }],                              // bowl wash
    [BuildingType.YOUTH_ACADEMY]:  [{ x: 0.30, y: 0.34, w: 0.24 }],                              // tower glass
    [BuildingType.TACTICS_ROOM]:   [{ x: 0.26, y: 0.26, w: 0.26 }, { x: 0.52, y: 0.34, w: 0.2 }], // war-room windows
    [BuildingType.MEDICAL_CENTER]: [{ x: 0.30, y: 0.28, w: 0.24 }],                              // rehab windows
    [BuildingType.TRAINING_PITCH]: [{ x: 0.20, y: 0.30, w: 0.18 }, { x: 0.60, y: 0.30, w: 0.18 }], // field lights
  };

  // ROOT IS NOT CLICKABLE: the sprite img is a big square with transparent corners,
  // and those invisible corners were stealing taps from neighbors' labels/bubbles.
  // Only the explicit hitbox (building body) and the badge buttons take pointers.
  return (
    <div className="absolute group pointer-events-none" style={{ left: c.x, top: c.y, zIndex: building.gridX + building.gridY + 6, transition: 'left 0.7s cubic-bezier(0.22, 1, 0.36, 1), top 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}>{/* formation switches GLIDE buildings to their new anchors instead of teleporting */}
      {/* 🔦 CC spotlight under the selected building */}
      {selected && (
        <div className="absolute -translate-x-1/2 rounded-[50%] pointer-events-none animate-pulse"
          style={{ left: 0, bottom: -TILE_H / 2 - 14, width: SPRITE_W * 1.3, height: TILE_H * 1.75, background: 'radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 55%, transparent 75%)', mixBlendMode: 'screen' }} />
      )}
      {/* 🎉 upgrade-complete burst */}
      {celebrating && (
        <div className="absolute pointer-events-none" style={{ left: 0, bottom: TILE_H * 0.4, zIndex: 70 }}>
          <div className="absolute -translate-x-1/2 rounded-full border-4 border-yellow-300" style={{ width: 20, height: 20, left: 0, bottom: 0, animation: 'fhq-reveal-burst 0.8s ease-out forwards' }} />
          {[0, 1, 2, 3].map(i => (
            <img key={i} src="/assets/fx/spark-star.png" alt="" draggable={false} className="absolute select-none" style={{
              width: 18, left: -30 + i * 20, bottom: -6 + (i % 2) * 16, opacity: 0,
              animation: `fhq-twinkle 0.9s ease-in-out ${i * 0.18}s 2`,
            }} />
          ))}
          <div className="absolute -translate-x-1/2 whitespace-nowrap font-display font-black text-yellow-300 text-sm uppercase" style={{ left: 0, bottom: 26, textShadow: '0 2px 4px #000', animation: 'fhq-reveal-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>Level up!</div>
        </div>
      )}
      {/* Glow ring under actionable buildings */}
      {actionable && (
        <div className="absolute -translate-x-1/2 rounded-[50%] bg-yellow-300/25 blur-md animate-pulse pointer-events-none"
          style={{ left: 0, bottom: -TILE_H / 2 - 6, width: SPRITE_W * 0.8, height: TILE_H * 1.1 }} />
      )}

      {/* Idle "breathe" lives on a wrapper (base-anchored scaleY) so it can't fight the
          hover/active transforms on the img. Negative delay de-syncs neighbors. */}
      <div className="absolute pointer-events-none" style={{
        width: SPRITE_W, left: -SPRITE_W / 2, bottom: -TILE_H / 2, transformOrigin: '50% 100%',
        animation: `fhq-breathe ${6 + ((building.gridX + building.gridY) % 3)}s ease-in-out -${(building.gridX * 7 + building.gridY * 13) % 6}s infinite`,
      }}>
        <img src={src} alt={info.name} draggable={false}
          className="select-none transition-transform group-hover:-translate-y-1 group-active:scale-95"
          style={{ display: 'block', width: '100%', maxWidth: 'none', height: 'auto', filter: 'drop-shadow(0 10px 8px rgba(0,0,0,0.35))' }} />
        {/* Scouting HQ chimney smoke — three staggered puffs rising off the roofline */}
        {isAcademy && [0, 1, 2].map(i => (
          <img key={i} src="/assets/fx/smoke-puff.png" alt="" draggable={false} className="absolute select-none" style={{
            width: 14 + i * 4, left: SPRITE_W * 0.44, bottom: SPRITE_W * 0.58,
            opacity: 0, animation: `fhq-smoke 4.5s linear ${i * 1.5}s infinite`,
          }} />
        ))}
        {/* Lit windows — always on (the night never ends here), breathing slowly.
            Screen blend keeps the art underneath readable. */}
        {(WINDOW_GLOWS[building.type] ?? []).map((g, i) => (
          <img key={`g${i}`} src="/assets/fx/window-glow.png" alt="" draggable={false} className="absolute select-none" style={{
            width: SPRITE_W * g.w, left: SPRITE_W * g.x, bottom: SPRITE_W * g.y,
            mixBlendMode: 'screen', animation: `fhq-glow ${4 + i}s ease-in-out ${(building.gridX * 3 + i * 2) % 4}s infinite`,
          }} />
        ))}
        {/* Stadium dressing: swaying team banner off the near corner + crowd shimmer isn't
            needed here (the bowl is tiny at board zoom) — banner only. */}
        {building.type === BuildingType.STADIUM && (
          <img src="/assets/fx/banner-team.png" alt="" draggable={false} className="absolute select-none" style={{
            width: SPRITE_W * 0.2, left: SPRITE_W * 0.03, bottom: SPRITE_W * 0.34,
            transformOrigin: '50% 0%', animation: 'fhq-sway 4s ease-in-out infinite',
          }} />
        )}
        {/* Collect-ready shimmer: two golden sparks twinkling over the haul */}
        {showBubble && [0, 1].map(i => (
          <img key={`s${i}`} src="/assets/fx/spark-star.png" alt="" draggable={false} className="absolute select-none" style={{
            width: 16 - i * 4, left: SPRITE_W * (0.3 + i * 0.28), bottom: SPRITE_W * (0.42 - i * 0.14),
            opacity: 0, animation: `fhq-twinkle 1.8s ease-in-out ${i * 0.7}s infinite`,
          }} />
        ))}
      </div>

      {/* Tap hitbox — the building's BODY, aligned to the art's true base (the sprite
          bottoms out at the footprint's low vertex, a full tile below center). */}
      <div data-fhq-bldg className="absolute cursor-pointer" onClick={handleClick}
        style={{ left: -SPRITE_W * 0.31, bottom: -TILE_H, width: SPRITE_W * 0.62, height: TILE_H * 2.3, pointerEvents: 'auto' }} />

      {/* Drill status badge */}
      {(isActive || isCompleted) && (
        <div className="absolute -translate-x-1/2 cursor-pointer" onClick={handleClick} style={{ left: 0, top: -58, zIndex: 60, pointerEvents: 'auto' }}>
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
        <div className="absolute -translate-x-1/2 cursor-pointer" onClick={handleClick} style={{ left: 0, top: -58, zIndex: 60, pointerEvents: 'auto' }}>
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

      {/* Coin indicator — shows the haul is ready; TAPPING THE BUILDING collects it
          (one tap target per building, no separate button to fight the sprite). */}
      {showBubble && (
        <div
          data-tour="collect"
          className="absolute -translate-x-1/2 flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border-[3px] border-white shadow-xl bg-amber-400 animate-bounce-sm pointer-events-none"
          style={{ left: 30, top: -30, zIndex: 44 }}
        >
          <Coins size={18} className="text-yellow-900 fill-yellow-800" />
          <span className="text-sm font-display font-bold text-yellow-950">{banked}</span>
        </div>
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

  // Real player art on the board (the `*-player.png` singles) — the color chip is only
  // the fallback while the sprite loads. Face the direction of travel.
  const facingLeft = player.targetPos.x < player.worldPos.x;

  return (
    <div className="absolute transition-all duration-[200ms] ease-linear animate-hop pointer-events-none"
      style={{ left: c.x, top: c.y, zIndex: Math.round((player.worldPos.y / 100) * GRID * 2) + 6, transform: 'translate(-50%,-100%)' }}>
      <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30" style={{ bottom: -3, width: 20, height: 7 }} />
      <div className="fhq-unit relative flex items-end justify-center" style={{ width: 30, height: 34, rotate: player.state === PlayerState.WALKING ? (facingLeft ? '-2.5deg' : '2.5deg') : undefined }}>
        <div className="absolute bottom-1 w-4 h-6 rounded-t-full rounded-b-sm border border-black/30 flex items-start justify-center shadow" style={{ backgroundColor: color }}>
          <span className="text-[7px] font-bold text-white/90 leading-tight mt-0.5">{player.role}</span>
        </div>
        <img src={unitPlayerSprite(player.unit)} alt="" draggable={false}
          onLoad={e => { const chip = e.currentTarget.previousElementSibling as HTMLElement; if (chip) chip.style.display = 'none'; }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          className="fhq-flat relative w-full h-auto max-w-none select-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
          style={{ transform: facingLeft ? 'scaleX(-1)' : undefined }} />
        {/* Real stride while WALKING: two frames alternate; art faces LEFT natively */}
        {player.state === PlayerState.WALKING && (() => {
          const base = unitPlayerSprite(player.unit).replace('-player.png', '');
          const wFlip = facingLeft ? undefined : 'scaleX(-1)';
          const rigOn = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.dataset.rig = '1'; };
          const rigOff = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.removeAttribute('data-rig'); };
          return (
            <>
              {(['walkA', 'walkC', 'walkB', 'walkD'] as const).map((fr, qi) => (
                <img key={fr} src={`${base}-${fr}.png`} alt="" draggable={false} onLoad={rigOn} onError={rigOff} className="absolute inset-0 w-full h-full object-contain select-none" style={{ animation: `fhq-q${qi + 1} 0.5s linear infinite`, transform: wFlip }} />
              ))}
            </>
          ); })()}
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

export const IsometricMap: React.FC<Props> = ({ buildings, players, bonusOrbs, timeOfDay, recruitSlot, upgrades = [], formationName, rankColor, rankName, trophies, fans, selectedId, celebrationId, onDeselect, onBuildingClick, onCollect, onCollectResource, onOrbClick }) => {
  const scale = useBoardScale();
  const boardRef = React.useRef<HTMLDivElement>(null);

  // 📷 CAMERA: pinch to zoom, one-finger drag to pan, double-tap to recenter.
  // Interaction math reads getBoundingClientRect, which already reflects the
  // transform — so zooming never breaks taps.
  // Phones open ZOOMED IN (a base you can read, pan to explore) — desktop fits the island.
  // Phone home zoom fits the WHOLE campus (fort spans tiles ~1..8 ≈ 944px board units;
  // at 390px that means z ≤ ~1.3 — 1.8 was tuned for the old spread layout and cropped
  // both edge buildings off-screen).
  // Desktop now opens PUNCHED IN (1.35 — the campus owns the frame, "bigger" per
  // Jumaane); phones keep the 1.28 whole-campus fit. Pan/pinch explores the rest.
  const homeZ = typeof window !== 'undefined' && window.innerWidth < 640 ? 1.28 : 1.35;
  // Home camera centers the STADIUM (the island's focal point at tile 5,5 → board y 505),
  // not the board's geometric middle — so the base reads centered, especially zoomed in.
  // +150 bias reveals the north grounds (megaboard behind the War Room, stands)
  // instead of framing dead-center on the stadium — the skyline reads at default.
  const homeY = Math.round((BOARD_H / 2 - tileToScreen(5, 5).y) * scale * homeZ) + 150; // stadium center (anchor 4,4 → center tile 5,5)
  const [cam, setCam] = useState({ z: homeZ, x: 0, y: homeY });
  const camClamp = (c: { z: number; x: number; y: number }) => {
    const z = Math.min(3, Math.max(0.85, c.z)); // floor raised: below ~0.85 the grounds rim could peek in

    const lim = 650 * z;
    return { z, x: Math.min(lim, Math.max(-lim, c.x)), y: Math.min(lim, Math.max(-lim, c.y)) };
  };
  const pointersRef = React.useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = React.useRef<{ d: number; z: number; cx: number; cy: number; camX: number; camY: number } | null>(null);
  const panRef = React.useRef<{ sx: number; sy: number; camX: number; camY: number } | null>(null);
  // True once a pan actually moved — the click that fires on pointer-up is a pan tail,
  // not a tap, and BuildingSprite's clickGuard swallows it.
  const panMovedRef = React.useRef(false);
  const resetCam = () => setCam({ z: homeZ, x: 0, y: homeY });
  // Desktop: wheel zooms (native non-passive listener so preventDefault works).
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam(c => camClamp({ ...c, z: c.z * (1 - e.deltaY * 0.0012) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!boardRef.current) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Second finger down → PINCH takes over (cancel any pan).
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        z: cam.z,
        cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2,
        camX: cam.x, camY: cam.y,
      };
      panRef.current = null;
      return;
    }
    // One finger/mouse anywhere: arm a pan. Taps stay taps — clicks on buildings
    // and bubbles fire normally on pointer-up unless the pan actually moved.
    panMovedRef.current = false;
    panRef.current = { sx: e.clientX, sy: e.clientY, camX: cam.x, camY: cam.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!boardRef.current) return;
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // PINCH: zoom around the gesture + follow the midpoint.
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      const p = pinchRef.current;
      setCam(camClamp({ z: p.z * (d / Math.max(1, p.d)), x: p.camX + (mx - p.cx), y: p.camY + (my - p.cy) }));
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) panMovedRef.current = true;
      if (panMovedRef.current) setCam(c => camClamp({ z: c.z, x: p.camX + (e.clientX - p.sx), y: p.camY + (e.clientY - p.sy) }));
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e) pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    panRef.current = null;
  };

  // 🛠 LAYOUT EDITOR state — null unless ?edit=1. Everything below renders from
  // the edited layout when it exists, so drags update the real board live.
  const [edit, setEdit] = useState<EditLayout | null>(() => (EDIT_ON ? loadEditLayout() : null));
  const [sel, setSel] = useState<SelRef | null>(null);
  const [snapStep, setSnapStep] = useState(0.5);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (edit) saveEditLayout(edit); }, [edit]);

  const outerList = edit ? edit.outer : OUTER_DECOR;
  const campusList = edit ? edit.campus : DECOR;
  // Home-board display remap FIRST (Jumaane's layout — battle geometry unaffected),
  // then any live editor overrides on top of it.
  const displayBuildings = buildings.map(b => {
    const o = HOME_DISPLAY_ANCHORS[b.type];
    return o ? { ...b, gridX: o.gridX, gridY: o.gridY } : b;
  });
  const shownBuildings = edit
    ? displayBuildings.map(b => { const o = edit.buildings[b.type]; return o ? { ...b, gridX: o.gx, gridY: o.gy } : b; })
    : displayBuildings;

  const selCoords = (l: EditLayout, r: SelRef): { gx: number; gy: number } => {
    switch (r.kind) {
      case 'outer': return { gx: l.outer[r.i].gridX, gy: l.outer[r.i].gridY };
      case 'campus': return { gx: l.campus[r.i].gridX, gy: l.campus[r.i].gridY };
      case 'board': return { gx: l.board.gx, gy: l.board.gy };
      case 'bldg': { const o = l.buildings[r.t]; if (o) return o; const b = displayBuildings.find(x => x.type === r.t); return { gx: b?.gridX ?? 0, gy: b?.gridY ?? 0 }; }
      case 'field': return r.c === 0 ? { gx: l.field.x1, gy: l.field.y1 } : { gx: l.field.x2, gy: l.field.y2 };
      case 'road': return r.c === 0 ? { gx: l.road.x1, gy: l.road.y1 } : { gx: l.road.x2, gy: l.road.y2 };
    }
  };
  const withCoords = (l: EditLayout, r: SelRef, gx: number, gy: number): EditLayout => {
    switch (r.kind) {
      case 'outer': return { ...l, outer: l.outer.map((d, i) => i === r.i ? { ...d, gridX: gx, gridY: gy } : d) };
      case 'campus': return { ...l, campus: l.campus.map((d, i) => i === r.i ? { ...d, gridX: gx, gridY: gy } : d) };
      case 'board': return { ...l, board: { ...l.board, gx, gy } };
      case 'bldg': { // 2×2 footprint must stay on the campus
        const cx = Math.max(0, Math.min(GRID - 2, Math.round(gx))), cy = Math.max(0, Math.min(GRID - 2, Math.round(gy)));
        return { ...l, buildings: { ...l.buildings, [r.t]: { gx: cx, gy: cy } } };
      }
      case 'field': return { ...l, field: r.c === 0 ? { ...l.field, x1: gx, y1: gy } : { ...l.field, x2: gx, y2: gy } };
      case 'road': return { ...l, road: r.c === 0 ? { ...l.road, x1: gx, y1: gy } : { ...l.road, x2: gx, y2: gy } };
    }
  };

  // Drag: pointer capture keeps every move on the marker; screen deltas divide by
  // the live zoom, then invert the iso projection into (col,row) deltas.
  const dragRef = React.useRef<{ ref: SelRef; sx: number; sy: number; ogx: number; ogy: number } | null>(null);
  const snapTo = (v: number, step: number) => r2(Math.round(v / step) * step);
  const markerDown = (r: SelRef) => (e: React.PointerEvent) => {
    if (!edit) return;
    e.stopPropagation(); e.preventDefault();
    setSel(r);
    const c = selCoords(edit, r);
    dragRef.current = { ref: r, sx: e.clientX, sy: e.clientY, ogx: c.gx, ogy: c.gy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const markerMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    e.stopPropagation();
    const k = scale * cam.z;
    const bdx = (e.clientX - d.sx) / k, bdy = (e.clientY - d.sy) / k;
    const dgx = (bdx / (TILE_W / 2) + bdy / (TILE_H / 2)) / 2;
    const dgy = (bdy / (TILE_H / 2) - bdx / (TILE_W / 2)) / 2;
    const step = d.ref.kind === 'bldg' ? 1 : snapStep;
    setEdit(l => l ? withCoords(l, d.ref, snapTo(d.ogx + dgx, step), snapTo(d.ogy + dgy, step)) : l);
  };
  const markerUp = (e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = null; };

  const bumpScale = (d: number) => {
    if (!edit || !sel) return;
    if (sel.kind === 'outer') setEdit({ ...edit, outer: edit.outer.map((it, i) => i === sel.i ? { ...it, scale: r2(Math.max(0.2, it.scale + d)) } : it) });
    else if (sel.kind === 'campus') setEdit({ ...edit, campus: edit.campus.map((it, i) => i === sel.i ? { ...it, scale: r2(Math.max(0.2, it.scale + d)) } : it) });
    else if (sel.kind === 'board') setEdit({ ...edit, board: { ...edit.board, w: r2(Math.max(1, edit.board.w + d)) } });
  };
  const flipSel = () => { if (edit && sel?.kind === 'outer') setEdit({ ...edit, outer: edit.outer.map((it, i) => i === sel.i ? { ...it, flip: !it.flip } : it) }); };
  const bumpZ = (d: number) => { if (edit && sel?.kind === 'outer') setEdit({ ...edit, outer: edit.outer.map((it, i) => i === sel.i ? { ...it, z: (it.z ?? Math.max(1, Math.round(it.gridX + it.gridY))) + d } : it) }); };
  const dupSel = () => {
    if (!edit || !sel) return;
    if (sel.kind === 'outer') { const src = edit.outer[sel.i]; const outer = [...edit.outer, { ...src, gridX: r2(src.gridX + 1), gridY: r2(src.gridY + 1) }]; setEdit({ ...edit, outer }); setSel({ kind: 'outer', i: outer.length - 1 }); }
    else if (sel.kind === 'campus') { const src = edit.campus[sel.i]; const campus = [...edit.campus, { ...src, gridX: r2(src.gridX + 1), gridY: r2(src.gridY + 1) }]; setEdit({ ...edit, campus }); setSel({ kind: 'campus', i: campus.length - 1 }); }
  };
  const delSel = () => {
    if (!edit || !sel) return;
    if (sel.kind === 'outer') { setEdit({ ...edit, outer: edit.outer.filter((_, i) => i !== sel.i) }); setSel(null); }
    else if (sel.kind === 'campus') { setEdit({ ...edit, campus: edit.campus.filter((_, i) => i !== sel.i) }); setSel(null); }
  };
  const copyLayout = () => {
    if (!edit) return;
    const code = genLayoutExport(edit, shownBuildings);
    console.log(code); // fallback if the clipboard is blocked
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2400); }).catch(() => { setCopied(true); setTimeout(() => setCopied(false), 2400); });
  };

  useEffect(() => {
    if (!EDIT_ON) return;
    const onKey = (e: KeyboardEvent) => {
      if (!sel || !edit) return;
      const step = sel.kind === 'bldg' ? 1 : snapStep;
      const move = (dx: number, dy: number) => { e.preventDefault(); const c = selCoords(edit, sel); setEdit(withCoords(edit, sel, r2(c.gx + dx), r2(c.gy + dy))); };
      if (e.key === 'ArrowRight') move(step, 0);
      else if (e.key === 'ArrowLeft') move(-step, 0);
      else if (e.key === 'ArrowDown') move(0, step);
      else if (e.key === 'ArrowUp') move(0, -step);
      else if (e.key === 'r' || e.key === 'R') flipSel();
      else if (e.key === 'd' || e.key === 'D') dupSel();
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, snapStep, edit]);

  // (Day/night ambient tint removed — the board "dimming itself" read as a bug,
  // not atmosphere. The backdrop is permanently stadium-night with floodlights.)
  const sortedBuildings = [...shownBuildings].sort((a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY));
  // ?grid=1 readout: every placed object with its tile coordinate + footprint,
  // so positions can be read straight off the console next to the visual grid.
  // Keyed on serialized placements — `buildings` is a fresh array every render,
  // which made this table spam the console on every animation tick.
  const gridReadoutKey = GRID_ON ? buildings.map(b => `${b.type}@${b.gridX},${b.gridY}`).join('|') : '';
  useEffect(() => {
    if (!GRID_ON) return;
    /* eslint-disable no-console */
    console.table([
      ...buildings.map(b => ({ object: BUILDING_INFO[b.type].name, col: b.gridX, row: b.gridY, footprint: '2×2' })),
      ...OUTER_DECOR.map(d => ({ object: `decor:${d.slug}${d.flip ? ' (flipped)' : ''}`, col: d.gridX, row: d.gridY, footprint: `~${(1.35 * d.scale).toFixed(1)}t wide` })),
      ...DECOR.map(d => ({ object: `decor:${d.slug}`, col: d.gridX, row: d.gridY, footprint: `~${(1.35 * d.scale).toFixed(1)}t wide` })),
      { object: 'ribbonboard (scoreboard)', col: BOARD_ANCHOR.gx, row: BOARD_ANCHOR.gy, footprint: `${BOARD_ANCHOR.w}t wide (native, cropped)` },
      ...DRILL_SQUAD.map((r, i) => ({ object: `drill-runner ${i + 1} (${r.slug})`, col: r.gx, row: `${r.gy} → ${r.gy + r.dgy}`, footprint: 'route' })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridReadoutKey]);
  // Only render players who are heading to / at a drill.
  const activePlayers = players.filter(p => p.state !== PlayerState.IDLE);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(130% 95% at 50% 42%, #143526 0%, #0e2619 45%, #0b1e14 75%, #081711 100%)' }}
      onClick={() => { if (panMovedRef.current) { panMovedRef.current = false; return; } onDeselect?.(); }}>{/* tap empty turf → CC bar closes */}
      {/* Backdrop is GROUNDS, not outer space — every pixel reads as dark grass under
          floodlit haze, so panning/zooming never exposes black void. (Starfield removed
          with the floating island; stars over grass read wrong.) */}
      {/* Floodlight beams sweeping in from the top corners */}
      <div className="absolute pointer-events-none" style={{ top: '-12%', left: '-4%', width: '52%', height: '95%', background: 'linear-gradient(160deg, rgba(255,244,210,0.11), rgba(255,244,210,0.03) 45%, transparent 65%)', transform: 'rotate(6deg)', filter: 'blur(4px)' }} />
      <div className="absolute pointer-events-none" style={{ top: '-12%', right: '-4%', width: '52%', height: '95%', background: 'linear-gradient(200deg, rgba(255,244,210,0.11), rgba(255,244,210,0.03) 45%, transparent 65%)', transform: 'rotate(-6deg)', filter: 'blur(4px)' }} />
      {/* Warm halo grounding the field */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: '4%', width: '135%', height: '46%', background: 'radial-gradient(ellipse at center, rgba(45,158,68,0.30) 0%, rgba(22,90,52,0.12) 52%, transparent 72%)', filter: 'blur(10px)' }} />
      {/* Board fills space between HUD (top) and nav (bottom). ABSOLUTE centering, not
          flex: Safari START-aligns oversized flex children (Chrome centers them), which
          shoved the whole island off-screen on iPhones. translate(-50%,-50%) is identical
          in every browser. */}
      <div className="absolute left-0 right-0 overflow-visible" style={{ top: 88, bottom: 88 }}>
        <div ref={boardRef} data-fhq-board onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onDoubleClick={resetCam}
          className="absolute"
          style={{ left: '50%', top: '50%', width: BOARD_W, height: BOARD_H, transform: `translate(calc(-50% + ${cam.x}px), calc(-50% + ${cam.y}px)) scale(${scale * cam.z})`, transformOrigin: 'center', touchAction: 'none' }}>
          <GroundLayer buildings={shownBuildings} field={edit?.field} road={edit?.road} />
          {/* Jumbotron paints FIRST: it towers behind the practice field, so the
              north goalpost and everything south of it must layer in front. */}
          <Jumbotron trophies={trophies} fans={fans} gx={edit?.board.gx} gy={edit?.board.gy} wMult={edit?.board.w} />
          {outerList.map((d, i) => (
            <DecorSprite key={`o${i}`} slug={d.slug} gridX={d.gridX} gridY={d.gridY} scale={d.scale} flip={d.flip} z={d.z} />
          ))}
          {DRILL_SQUAD.map((r, i) => (
            <DrillRunner key={`dr${i}`} {...r} />
          ))}
          {GRID_ON && <GridOverlay />}
          {campusList.map((d, i) => (
            <DecorSprite key={`c${i}`} slug={d.slug} gridX={d.gridX} gridY={d.gridY} scale={d.scale} />
          ))}
          {sortedBuildings.map((b) => (
            <BuildingSprite key={b.id} building={b} recruitSlot={recruitSlot} upgradeJob={upgrades.find(u => u.kind === 'building' && u.key === b.id)} clickGuard={panMovedRef} onBuildingClick={onBuildingClick} onCollect={onCollect} onCollectResource={onCollectResource} selected={selectedId === b.id} celebrating={celebrationId === b.id} />
          ))}
          {/* ☁️ Cloud shade drifting over the campus — two lanes, same wind, shading
              everything under them (hidden entirely under prefers-reduced-motion). */}
          <div className="fhq-cloud absolute pointer-events-none" style={{ left: 0, top: 0, width: 470, height: 280, background: 'radial-gradient(ellipse at center, rgba(2,6,18,0.28) 0%, rgba(2,6,18,0.12) 55%, transparent 76%)', filter: 'blur(24px)', zIndex: 55, animation: 'fhq-cloud1 115s linear infinite' }} />
          <div className="fhq-cloud absolute pointer-events-none" style={{ left: 0, top: 0, width: 330, height: 190, background: 'radial-gradient(ellipse at center, rgba(2,6,18,0.24) 0%, rgba(2,6,18,0.10) 55%, transparent 76%)', filter: 'blur(20px)', zIndex: 55, animation: 'fhq-cloud2 84s linear -38s infinite' }} />
          {/* Name tags live in their OWN layer above every sprite (nested z-index gets
              trapped in a building's stacking context) and sit UNDER each building at
              its base — on the grass, never across the art. */}
          {/* 🎖 RANK SKIN — pennant flags in your TIER's color fly over the stadium;
              they recolor every time you climb the ladder (Sandlot grey → GOAT gold). */}
          {rankColor && (() => {
            const st = shownBuildings.find(b => b.type === BuildingType.STADIUM);
            if (!st) return null;
            const corners = [[0, 0], [2, 0], [0, 2], [2, 2]] as const;
            return corners.map(([dx, dy], i) => {
              const c = tileToScreen(st.gridX + dx, st.gridY + dy);
              return (
                <div key={`rf${i}`} className="absolute pointer-events-none" style={{ left: c.x - 1, top: c.y - 46, zIndex: st.gridX + st.gridY + 7 }}>
                  <div style={{ width: 2, height: 34, background: '#cbd5e1', borderRadius: 1 }} />
                  <div className="absolute" style={{ left: 2, top: 2, width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: `16px solid ${rankColor}`, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))', animation: `fhq-wave 1.6s ease-in-out ${i * 0.2}s infinite` }} />
                </div>
              );
            });
          })()}
          {/* 📋 Scheme pennant — the one element that ALWAYS changes when you switch
              formations (Cover 3 and Max Protect share anchors, so without this the
              switch looked like a no-op on the home board). */}
          {formationName && (() => {
            const st = shownBuildings.find(b => b.type === BuildingType.STADIUM);
            if (!st) return null;
            const c = tileToScreen(st.gridX + 0.5, st.gridY + 0.5);
            return (
              <div className="absolute -translate-x-1/2 pointer-events-none" style={{ left: c.x, top: c.y - TILE_H * 3.9, zIndex: 47 }}>
                <span className="text-[10px] font-display font-black uppercase tracking-wide text-sky-200 bg-sky-950/80 border border-sky-700/60 px-2 py-0.5 rounded-full whitespace-nowrap" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                  📋 {formationName}
                </span>
              </div>
            );
          })()}
          {sortedBuildings.map((b) => {
            const c = tileToScreen(b.gridX + 0.5, b.gridY + 0.5);
            // INTEGRATED labels (Jumaane): no more floating black pills — each name is
            // PAINTED ON THE TURF at the building's feet like groundskeeper stenciling,
            // skewed onto the iso ground plane (baseline follows the down-right tile
            // edge, atan(TILE_H/TILE_W) ≈ 26.57° for this 2:1 projection).
            return (
              <div key={`tag-${b.id}`} className="absolute pointer-events-none" style={{ left: c.x - TILE_W * 0.55, top: c.y + TILE_H * 0.55, zIndex: 46 }}>
                <span className="font-display font-black uppercase whitespace-nowrap select-none"
                  style={{ display: 'inline-block', fontSize: 13, letterSpacing: 2.5, color: 'rgba(255,255,255,0.62)', transform: 'skewY(-26.57deg) scaleY(0.9)', transformOrigin: '0 50%', textShadow: '0 1px 0 rgba(0,0,0,0.35)' }}>
                  {BUILDING_INFO[b.type].name}&nbsp;<span style={{ color: 'rgba(253,186,116,0.95)' }}>{b.level}</span>
                </span>
              </div>
            );
          })}
          {activePlayers.map((p) => (
            <PlayerMarker key={p.id} player={p} />
          ))}
          {bonusOrbs.map((orb) => (
            <BonusOrbSprite key={orb.id} orb={orb} onOrbClick={onOrbClick} />
          ))}
          {/* 🛠 EDITOR DRAG HANDLES — one dot per piece, riding the board transform so
              they track pan/zoom for free. Colors by family (legend in the panel). */}
          {edit && (
            <>
              {edit.outer.map((d, i) => (
                <EditMarker key={`m-o${i}`} gx={d.gridX} gy={d.gridY} color="#f97316" label={`${d.slug} (${d.gridX}, ${d.gridY})`}
                  sel={sel?.kind === 'outer' && sel.i === i} onDown={markerDown({ kind: 'outer', i })} onMove={markerMove} onUp={markerUp} />
              ))}
              {edit.campus.map((d, i) => (
                <EditMarker key={`m-c${i}`} gx={d.gridX} gy={d.gridY} color="#eab308" label={`${d.slug} (${d.gridX}, ${d.gridY})`}
                  sel={sel?.kind === 'campus' && sel.i === i} onDown={markerDown({ kind: 'campus', i })} onMove={markerMove} onUp={markerUp} />
              ))}
              <EditMarker gx={edit.board.gx} gy={edit.board.gy} color="#a855f7" label={`scoreboard (${edit.board.gx}, ${edit.board.gy})`}
                sel={sel?.kind === 'board'} onDown={markerDown({ kind: 'board' })} onMove={markerMove} onUp={markerUp} />
              {shownBuildings.map(b => (
                <EditMarker key={`m-b${b.id}`} gx={b.gridX} gy={b.gridY} color="#ef4444" label={`${BUILDING_INFO[b.type].name} (${b.gridX}, ${b.gridY})`}
                  sel={sel?.kind === 'bldg' && sel.t === b.type} onDown={markerDown({ kind: 'bldg', t: b.type })} onMove={markerMove} onUp={markerUp} />
              ))}
              {([0, 1] as const).map(c => (
                <EditMarker key={`m-f${c}`} gx={c === 0 ? edit.field.x1 : edit.field.x2} gy={c === 0 ? edit.field.y1 : edit.field.y2} color="#22d3ee"
                  label={`practice field · ${c === 0 ? 'top' : 'bottom'} corner`} sel={sel?.kind === 'field' && sel.c === c}
                  onDown={markerDown({ kind: 'field', c })} onMove={markerMove} onUp={markerUp} />
              ))}
              {([0, 1] as const).map(c => (
                <EditMarker key={`m-r${c}`} gx={c === 0 ? edit.road.x1 : edit.road.x2} gy={c === 0 ? edit.road.y1 : edit.road.y2} color="#94a3b8"
                  label={`road · ${c === 0 ? 'top' : 'bottom'} corner`} sel={sel?.kind === 'road' && sel.c === c}
                  onDown={markerDown({ kind: 'road', c })} onMove={markerMove} onUp={markerUp} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Camera wandered? One tap home. (Double-tap the board does the same.) */}
      {(cam.z !== homeZ || cam.x !== 0 || cam.y !== homeY) && (
        <button onClick={resetCam} title="Recenter the board"
          className="absolute bottom-24 left-3 z-40 bg-[#111827]/95 border border-slate-700 hover:border-orange-400 text-slate-200 p-2.5 rounded-2xl shadow-xl transition-colors">
          <span className="block text-[12px] font-bold leading-none">⌖</span>
        </button>
      )}

      {/* 🛠 EDITOR PANEL — fixed to the viewport, never pans with the board */}
      {edit && (
        <div className="absolute right-2 z-50 w-[252px] bg-[#0b1220]/95 border border-slate-700 rounded-2xl shadow-2xl p-3 text-slate-200 font-mono text-[11px] leading-snug select-none"
          style={{ top: 96 }} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <div className="font-black text-[13px] tracking-wide text-orange-400 mb-1">🛠 LAYOUT EDITOR</div>
          <div className="text-slate-400 mb-2">
            drag a dot — it snaps to the grid<br />
            arrows nudge · R flip · D duplicate · ⌫ delete<br />
            <span style={{ color: '#f97316' }}>●</span> grounds <span style={{ color: '#eab308' }}>●</span> campus <span style={{ color: '#ef4444' }}>●</span> buildings <span style={{ color: '#a855f7' }}>●</span> board <span style={{ color: '#22d3ee' }}>●</span> field <span style={{ color: '#94a3b8' }}>●</span> road
          </div>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-slate-400 mr-1">snap</span>
            {[1, 0.5, 0.25, 0.1].map(s => (
              <button key={s} onClick={() => setSnapStep(s)}
                className={`px-1.5 py-0.5 rounded border ${snapStep === s ? 'bg-orange-500 text-black border-orange-400 font-bold' : 'border-slate-600 text-slate-300'}`}>{s}</button>
            ))}
            <span className="text-slate-500 ml-1">tiles</span>
          </div>
          {sel && (() => {
            const c = selCoords(edit, sel);
            const name = sel.kind === 'outer' ? edit.outer[sel.i]?.slug
              : sel.kind === 'campus' ? edit.campus[sel.i]?.slug
              : sel.kind === 'board' ? 'scoreboard'
              : sel.kind === 'bldg' ? BUILDING_INFO[sel.t].name
              : sel.kind === 'field' ? `practice field · ${sel.c ? 'bottom' : 'top'} corner`
              : `road · ${sel.c ? 'bottom' : 'top'} corner`;
            if (name === undefined) return null; // selection outlived a delete
            const scaleVal = sel.kind === 'outer' ? edit.outer[sel.i].scale
              : sel.kind === 'campus' ? edit.campus[sel.i].scale
              : sel.kind === 'board' ? edit.board.w : null;
            return (
              <div className="border-t border-slate-700 pt-2 mb-2">
                <div className="font-bold text-white truncate">{name}</div>
                <div className="text-orange-300">col {c.gx} · row {c.gy}{sel.kind === 'outer' && edit.outer[sel.i].flip ? ' · flipped' : ''}{sel.kind === 'outer' && edit.outer[sel.i].z !== undefined ? ` · layer ${edit.outer[sel.i].z}` : ''}</div>
                {scaleVal !== null && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className="text-slate-400">{sel.kind === 'board' ? 'width' : 'scale'}</span>
                    <button onClick={() => bumpScale(-0.1)} className="px-1.5 rounded border border-slate-600 hover:border-orange-400">−</button>
                    <span className="min-w-[26px] text-center">{scaleVal}</span>
                    <button onClick={() => bumpScale(0.1)} className="px-1.5 rounded border border-slate-600 hover:border-orange-400">+</button>
                    {sel.kind === 'outer' && (
                      <>
                        <button onClick={flipSel} className="ml-1 px-1.5 rounded border border-slate-600 hover:border-orange-400">flip</button>
                        <button onClick={() => bumpZ(-1)} title="paint further behind" className="px-1.5 rounded border border-slate-600 hover:border-orange-400">z−</button>
                        <button onClick={() => bumpZ(1)} title="paint further in front" className="px-1.5 rounded border border-slate-600 hover:border-orange-400">z+</button>
                      </>
                    )}
                  </div>
                )}
                {(sel.kind === 'outer' || sel.kind === 'campus') && (
                  <div className="flex gap-1 mt-1.5">
                    <button onClick={dupSel} className="px-1.5 py-0.5 rounded border border-slate-600 hover:border-orange-400">duplicate</button>
                    <button onClick={delSel} className="px-1.5 py-0.5 rounded border border-red-800 text-red-300 hover:border-red-500">delete</button>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="flex flex-col gap-1.5 border-t border-slate-700 pt-2">
            <button onClick={copyLayout} className={`w-full py-1.5 rounded-lg font-black transition-colors ${copied ? 'bg-green-500 text-black' : 'bg-orange-500 text-black hover:bg-orange-400'}`}>
              {copied ? '✓ COPIED — paste it to Claude' : 'COPY LAYOUT CODE'}
            </button>
            <div className="flex gap-1.5">
              <button onClick={() => { localStorage.removeItem(EDIT_LS_KEY); location.reload(); }} title="Throw away edits, back to the shipped layout"
                className="flex-1 py-1 rounded-lg border border-slate-600 hover:border-red-400">reset</button>
              <button onClick={() => { location.href = location.pathname; }} title="Leave the editor (edits stay saved in this browser)"
                className="flex-1 py-1 rounded-lg border border-slate-600 hover:border-orange-400">exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
