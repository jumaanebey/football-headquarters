// 3D model construction for players, facilities and resource props (all procedural, all football).
// No weapons anywhere: staffers carry clipboards and gear bags, players carry footballs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { OWNER_COLORS, OWNER_BASE } from './config.js';
import { mulberry32 } from './noise.js';

export const M = {}; // shared materials
export const G = {}; // shared geometries
let fow = null;

function std(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  if (fow) fow.apply(m);
  return m;
}

export function initMaterials(fog) {
  fow = fog;
  // lighter accents than the flat brand hexes so ACES tone mapping keeps orange reading as orange
  const ACCENT = [0xfb923c, 0xdc2626];
  const rep = (tex, r) => { const t = tex.clone(); t.repeat.set(r, r); t.needsUpdate = true; return t; };
  // environment / facilities
  M.concrete = std({ map: T.plasterTexture(), roughness: 0.95, color: 0xd9d4cc });
  M.brick = std({ map: T.stoneWallTexture(), roughness: 0.9, color: 0xc9b9a8 });
  M.plank = std({ map: T.woodPlankTexture(), roughness: 0.85 });
  M.turf = std({ map: T.turfLinesTexture(), roughness: 1 });
  M.turfPlain = std({ map: rep(T.grassTexture(), 2), roughness: 1, color: 0x8fd08a });
  M.hazard = std({ map: T.hazardTexture(), roughness: 0.8 });
  M.steel = std({ map: T.metalTexture(), roughness: 0.45, metalness: 0.7, color: 0xb8c0cc });
  M.darkSteel = std({ color: 0x4b5563, roughness: 0.6, metalness: 0.5 });
  M.crate = std({ map: T.crateTexture(), roughness: 0.9 });
  M.turfRoll = std({ map: rep(T.grassTexture(), 1.5), roughness: 1, color: 0x9be08f });
  M.rock = std({ map: T.rockTexture(), roughness: 0.95 });
  M.wood = std({ color: 0x6b4a2a, roughness: 0.9 });
  M.dark = std({ color: 0x1f2430, roughness: 0.9 });
  M.white = std({ color: 0xf3f4f6, roughness: 0.8 });
  M.goal = std({ color: 0xfacc15, roughness: 0.5, metalness: 0.3 });
  M.cone = std({ color: 0xf97316, roughness: 0.7 });
  M.cooler = std({ color: 0x2563eb, roughness: 0.6 });
  M.grill = std({ color: 0x111827, roughness: 0.5, metalness: 0.4 });
  M.canopyNeutral = std({ map: T.canopyTexture(0xffffff, 0xf59e0b), roughness: 0.9, side: THREE.DoubleSide });
  M.canopyBooster = std({ map: T.canopyTexture(0xffffff, 0x2563eb), roughness: 0.9, side: THREE.DoubleSide });
  M.football = std({ map: T.footballTexture(), roughness: 0.7 });
  M.glass = std({ color: 0x9fd3ff, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.6 });
  M.scoreboard = std({ color: 0x0b1020, roughness: 0.4, emissive: 0x1d4ed8, emissiveIntensity: 0.6 });
  M.skin = std({ map: T.skinTexture(), roughness: 0.8 });
  M.khaki = std({ color: 0xc8b48a, roughness: 0.9 });
  M.cleat = std({ color: 0x111111, roughness: 0.7 });
  // team colours
  M.jersey = ACCENT.map((c, i) => std({ map: T.jerseyTexture(OWNER_BASE[i], c), roughness: 0.85 }));
  M.helmet = OWNER_COLORS.map((c, i) => std({ color: i === 0 ? OWNER_BASE[0] : c, roughness: 0.35, metalness: 0.15 }));
  M.pants = OWNER_COLORS.map((c, i) => std({ color: i === 0 ? OWNER_BASE[0] : OWNER_BASE[1], roughness: 0.9 }));
  M.trim = ACCENT.map(c => std({ color: c, roughness: 0.6 }));
  M.polo = [std({ map: T.clothTexture(0xfb923c), roughness: 0.9 }), std({ map: T.clothTexture(0xdc2626), roughness: 0.9 })];
  M.canopy = ACCENT.map(c => std({ map: T.canopyTexture(0xffffff, c), roughness: 0.9, side: THREE.DoubleSide }));
  M.stands = ACCENT.map(c => std({ map: T.standsTexture(c), roughness: 0.9 }));
  M.banner = ACCENT.map(c => std({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
  M.tshirt = ACCENT.map(c => std({ color: c, roughness: 0.9 }));
  M.scaffold = std({ map: T.hazardTexture(), roughness: 1, transparent: true, opacity: 0.9 });
  M.blade = new THREE.MeshStandardMaterial({ map: T.grassBladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xbfd4a0 });
  M.ring = OWNER_COLORS.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false }));
  M.ringHover = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  M.confetti = [0xf97316, 0xfacc15, 0xffffff, 0x2563eb, 0x22c55e, 0xb91c1c];

  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.sphere = new THREE.SphereGeometry(0.5, 12, 10);
  G.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  G.cone = new THREE.ConeGeometry(0.5, 1, 10);
  G.ring = new THREE.RingGeometry(0.75, 0.9, 28);
  G.football = new THREE.SphereGeometry(0.5, 10, 8); G.football.scale(0.36, 0.36, 0.6);
  G.tshirt = new THREE.BoxGeometry(0.42, 0.14, 0.34);
}

export function prismRoof(w, d, h) {
  // triangular prism roof, ridge along x; sits on y=0
  const hw = w / 2, hd = d / 2;
  const pos = [], nor = [], uv = [], idx = [];
  const addQuad = (a, b, c, e, n, uvs) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...e);
    for (let k = 0; k < 4; k++) nor.push(...n);
    uv.push(...uvs);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const slopeLen = Math.hypot(hd, h);
  const nz = h / slopeLen, ny = hd / slopeLen;
  addQuad([-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], [0, ny, nz], [0, 0, w / 2, 0, w / 2, slopeLen / 2, 0, slopeLen / 2]);
  addQuad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], [0, ny, -nz], [0, 0, w / 2, 0, w / 2, slopeLen / 2, 0, slopeLen / 2]);
  const addTri = (a, b, c, n, uvs) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) nor.push(...n);
    uv.push(...uvs); idx.push(i, i + 1, i + 2);
  };
  addTri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0], [1, 0, 0], [0, 0, d / 2, 0, d / 4, h / 2]);
  addTri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0], [-1, 0, 0], [0, 0, d / 2, 0, d / 4, h / 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

function boxGeo(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cylGeo(rTop, rBot, h, x, y, z, seg = 10, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

// ---------- resource props (geometries for instancing) ----------
// Gear pallet A: a pallet with stacked equipment crates.
export function palletGeometriesA() {
  const base = boxGeo(2.2, 0.16, 2.2, 0, 0.08, 0);
  const crates = mergeGeometries([
    boxGeo(1.0, 0.9, 1.0, -0.5, 0.61, -0.5), boxGeo(0.9, 0.7, 1.0, 0.55, 0.51, -0.45),
    boxGeo(1.1, 0.8, 0.9, -0.45, 0.56, 0.55), boxGeo(0.8, 0.6, 0.8, 0.55, 0.46, 0.55),
    boxGeo(0.9, 0.75, 0.9, -0.1, 1.45, 0.0, 0.4), boxGeo(0.7, 0.55, 0.7, 0.35, 1.2, 0.5, -0.3),
  ]);
  return { base, crates };
}
// Gear pallet B: a taller stack plus a ball bin.
export function palletGeometriesB() {
  const base = mergeGeometries([boxGeo(2.2, 0.16, 2.2, 0, 0.08, 0), cylGeo(0.55, 0.5, 1.1, 0.7, 0.71, 0.6, 12)]);
  const crates = mergeGeometries([
    boxGeo(1.3, 0.9, 1.1, -0.35, 0.61, -0.4), boxGeo(1.1, 0.8, 1.0, -0.3, 1.46, -0.35, 0.25),
    boxGeo(0.9, 0.7, 0.9, -0.2, 2.2, -0.3, -0.35), boxGeo(0.8, 0.6, 0.9, 0.6, 0.46, -0.5),
  ]);
  return { base, crates };
}
// Booster tent: striped canopy on poles, table underneath.
export function boosterTentGeometry() {
  const frame = mergeGeometries([
    cylGeo(0.05, 0.05, 2.2, -1.1, 1.1, -1.1, 6), cylGeo(0.05, 0.05, 2.2, 1.1, 1.1, -1.1, 6),
    cylGeo(0.05, 0.05, 2.2, -1.1, 1.1, 1.1, 6), cylGeo(0.05, 0.05, 2.2, 1.1, 1.1, 1.1, 6),
    boxGeo(1.6, 0.08, 0.8, 0, 0.9, 0), boxGeo(0.08, 0.9, 0.08, -0.7, 0.45, -0.3), boxGeo(0.08, 0.9, 0.08, 0.7, 0.45, 0.3),
    boxGeo(0.5, 0.3, 0.4, -0.3, 1.1, 0), boxGeo(0.35, 0.25, 0.3, 0.4, 1.07, -0.1),
  ]);
  const canopy = new THREE.ConeGeometry(1.5, 0.7, 4); canopy.rotateY(Math.PI / 4); canopy.translate(0, 2.5, 0);
  return { frame, canopy };
}
// Turf pile: rolled turf on a pallet.
export function turfPileGeometry() {
  const rolls = [];
  const spec = [[-0.7, 0.45, -0.4], [0.05, 0.45, -0.45], [0.8, 0.45, -0.4], [-0.35, 1.2, -0.4], [0.4, 1.2, -0.4], [0.0, 1.95, -0.4], [-0.5, 0.45, 0.6], [0.4, 0.45, 0.65]];
  for (const [x, y, z] of spec) rolls.push(cylGeo(0.42, 0.42, 1.6, x, y, z, 12, 0, Math.PI / 2));
  const pallet = boxGeo(2.4, 0.16, 2.4, 0, 0.08, 0);
  return { rolls: mergeGeometries(rolls), pallet };
}
// Tailgate: grill, cooler, folding table, chairs, pop-up canopy.
export function tailgateGeometry() {
  const metal = mergeGeometries([
    // grill: body on legs with dome lid
    boxGeo(1.0, 0.35, 0.6, -0.8, 0.85, -0.5), cylGeo(0.04, 0.04, 0.7, -1.2, 0.35, -0.7, 6), cylGeo(0.04, 0.04, 0.7, -0.4, 0.35, -0.3, 6),
    cylGeo(0.04, 0.04, 0.7, -1.2, 0.35, -0.3, 6), cylGeo(0.04, 0.04, 0.7, -0.4, 0.35, -0.7, 6),
    new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.8, 1.02, -0.5),
    // table + chairs
    boxGeo(1.6, 0.06, 0.8, 0.6, 0.75, 0.3), cylGeo(0.03, 0.03, 0.75, 0.0, 0.37, 0.0, 6), cylGeo(0.03, 0.03, 0.75, 1.2, 0.37, 0.6, 6),
    cylGeo(0.03, 0.03, 0.75, 0.0, 0.37, 0.6, 6), cylGeo(0.03, 0.03, 0.75, 1.2, 0.37, 0.0, 6),
    boxGeo(0.45, 0.06, 0.45, 0.4, 0.45, 1.0), boxGeo(0.45, 0.5, 0.06, 0.4, 0.7, 1.22), boxGeo(0.45, 0.06, 0.45, 1.0, 0.45, 1.0), boxGeo(0.45, 0.5, 0.06, 1.0, 0.7, 1.22),
    // canopy poles
    cylGeo(0.04, 0.04, 2.3, -0.9, 1.15, 0.95, 6), cylGeo(0.04, 0.04, 2.3, 1.1, 1.15, 0.95, 6), cylGeo(0.04, 0.04, 2.3, -0.9, 1.15, -1.05, 6), cylGeo(0.04, 0.04, 2.3, 1.1, 1.15, -1.05, 6),
  ]);
  const cooler = mergeGeometries([boxGeo(0.7, 0.5, 0.45, 0.4, 0.25, -0.9), boxGeo(0.74, 0.1, 0.49, 0.4, 0.55, -0.9)]);
  const canopy = new THREE.ConeGeometry(1.55, 0.6, 4); canopy.rotateY(Math.PI / 4); canopy.translate(0.1, 2.55, -0.05);
  return { metal, cooler, canopy };
}

// ---------- units ----------
export function buildUnit(type, owner) {
  const g = new THREE.Group();
  const parts = {};
  const body = new THREE.Group(); g.add(body); parts.body = body;
  const isStaff = type === 'villager';
  const bulk = type === 'militia' ? 1.3 : type === 'knight' ? 1.15 : 1.0;
  const scale = type === 'knight' ? 1.08 : type === 'militia' ? 1.04 : 1.0;
  const torsoMat = isStaff ? M.polo[owner] : M.jersey[owner];
  const legMat = isStaff ? M.khaki : M.pants[owner];
  // legs
  const legL = new THREE.Group(); legL.position.set(-0.14 * scale * bulk, 0.74 * scale, 0);
  legL.add(mesh(G.box, legMat, 0, -0.34 * scale, 0, 0.19 * scale * bulk, 0.62 * scale, 0.2 * scale));
  legL.add(mesh(G.box, M.cleat, 0, -0.7 * scale, 0.04, 0.2 * scale * bulk, 0.12 * scale, 0.3 * scale));
  const legR = legL.clone(); legR.position.x = 0.14 * scale * bulk;
  body.add(legL, legR); parts.legL = legL; parts.legR = legR;
  // torso
  const torso = new THREE.Group(); torso.position.y = 0.74 * scale; body.add(torso); parts.torso = torso;
  torso.add(mesh(G.box, torsoMat, 0, 0.36 * scale, 0, 0.56 * scale * bulk, 0.72 * scale, 0.34 * scale * bulk));
  if (!isStaff) {
    // shoulder pads
    torso.add(mesh(G.box, torsoMat, 0, 0.66 * scale, 0, 0.78 * scale * bulk, 0.2 * scale, 0.42 * scale * bulk));
    // number stripe
    torso.add(mesh(G.box, M.trim[owner], 0, 0.36 * scale, 0.18 * scale * bulk, 0.2 * scale, 0.32 * scale, 0.02));
  }
  // head
  if (isStaff) {
    torso.add(mesh(G.sphere, M.skin, 0, 0.92 * scale, 0, 0.36, 0.38, 0.36));
    torso.add(mesh(G.cyl, M.helmet[owner], 0, 1.06 * scale, 0, 0.4, 0.14, 0.4)); // cap
    torso.add(mesh(G.box, M.helmet[owner], 0, 1.0 * scale, 0.22, 0.4, 0.04, 0.22)); // cap peak
  } else {
    const helmet = mesh(G.sphere, M.helmet[owner], 0, 0.96 * scale, 0, 0.46, 0.46, 0.48);
    torso.add(helmet);
    torso.add(mesh(G.box, M.trim[owner], 0, 1.17 * scale, 0, 0.06, 0.03, 0.42)); // helmet stripe
    // facemask bars
    for (let i = 0; i < 3; i++) torso.add(mesh(G.box, M.steel, 0, (0.84 + i * 0.07) * scale, 0.22, 0.34, 0.02, 0.05, false));
    torso.add(mesh(G.box, M.steel, 0.15, 0.9 * scale, 0.2, 0.02, 0.18, 0.05, false));
    torso.add(mesh(G.box, M.steel, -0.15, 0.9 * scale, 0.2, 0.02, 0.18, 0.05, false));
    if (type === 'knight') torso.add(mesh(G.box, M.dark, 0, 0.93 * scale, 0.24, 0.3, 0.09, 0.03, false)); // visor
  }
  // arms
  const armMat = isStaff ? M.skin : torsoMat;
  const armL = new THREE.Group(); armL.position.set(-0.36 * scale * bulk, 0.62 * scale, 0);
  armL.add(mesh(G.box, armMat, 0, -0.16 * scale, 0, 0.15 * scale * bulk, 0.34 * scale, 0.15 * scale));
  armL.add(mesh(G.box, M.skin, 0, -0.44 * scale, 0, 0.13 * scale * bulk, 0.26 * scale, 0.13 * scale));
  const armR = armL.clone(); armR.position.x = 0.36 * scale * bulk;
  torso.add(armL, armR); parts.armL = armL; parts.armR = armR;
  // props (no weapons)
  if (isStaff) {
    const board = mesh(G.box, M.white, 0, -0.5, 0.14, 0.26, 0.34, 0.03); armR.add(board); parts.tool = board;
    board.add(mesh(G.box, M.dark, 0, 0.14, 0.02, 0.1, 0.06, 0.02, false));
    const sack = mesh(G.box, M.dark, -0.05, 0.5, -0.32, 0.5, 0.36, 0.3); sack.visible = false;
    torso.add(sack); parts.sack = sack;
    sack.add(mesh(G.box, M.trim[owner], 0, 0, -0.16, 0.5, 0.08, 0.02, false));
  } else if (type === 'archer') {
    const ball = mesh(G.football, M.football, 0, -0.5, 0.1, 1, 1, 1); armR.add(ball); parts.tool = ball;
  } else if (type === 'militia') {
    // forearm pads
    armL.add(mesh(G.box, M.trim[owner], 0, -0.4, 0, 0.19 * bulk, 0.2, 0.19));
    armR.add(mesh(G.box, M.trim[owner], 0, -0.4, 0, 0.19 * bulk, 0.2, 0.19));
  } else if (type === 'knight') {
    armL.add(mesh(G.box, M.trim[owner], 0, -0.4, 0, 0.19 * bulk, 0.2, 0.19));
    armR.add(mesh(G.box, M.trim[owner], 0, -0.4, 0, 0.19 * bulk, 0.2, 0.19));
    torso.add(mesh(G.box, M.trim[owner], 0, 0.1 * scale, 0, 0.6 * scale * bulk, 0.08, 0.36 * scale * bulk)); // belt
  }
  g.userData.parts = parts;
  return g;
}

// ---------- facilities ----------
function flag(owner, x, y, z, h = 3) {
  const grp = new THREE.Group(); grp.position.set(x, y, z);
  grp.add(mesh(G.cyl, M.steel, 0, h / 2, 0, 0.08, h, 0.08));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), M.banner[owner]);
  f.position.set(0.7, h - 0.5, 0); f.castShadow = true;
  grp.add(f); grp.userData.flag = f;
  return grp;
}
function plinth(size, mat = M.concrete) {
  return mesh(G.box, mat, 0, -0.9, 0, size - 0.2, 1.8, size - 0.2);
}
function goalPost(x, z, rotY) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  g.add(mesh(G.cyl, M.goal, 0, 1.2, 0, 0.1, 2.4, 0.1));
  g.add(mesh(G.cyl, M.goal, 0, 2.4, 0, 0.08, 2.4, 0.08).rotateZ(Math.PI / 2));
  g.add(mesh(G.cyl, M.goal, -1.2, 3.6, 0, 0.07, 2.4, 0.07));
  g.add(mesh(G.cyl, M.goal, 1.2, 3.6, 0, 0.07, 2.4, 0.07));
  return g;
}
function lightPole(x, z, h = 7) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.add(mesh(G.cyl, M.darkSteel, 0, h / 2, 0, 0.12, h, 0.12));
  g.add(mesh(G.box, M.steel, 0, h, 0, 1.2, 0.5, 0.25));
  g.add(mesh(G.box, M.white, 0, h - 0.05, 0.13, 1.1, 0.35, 0.02, false));
  return g;
}
function canopyTent(mat, size, h, poleH) {
  const g = new THREE.Group();
  const hs = size / 2 - 0.15;
  for (const [x, z] of [[-hs, -hs], [hs, -hs], [-hs, hs], [hs, hs]]) g.add(mesh(G.cyl, M.steel, x, poleH / 2, z, 0.08, poleH, 0.08));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.78, h, 4), mat); roof.rotation.y = Math.PI / 4; roof.position.y = poleH + h / 2; roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  return g;
}
function cones(g, list) { for (const [x, z] of list) { g.add(mesh(G.cone, M.cone, x, 0.32, z, 0.4, 0.6, 0.4)); g.add(mesh(G.box, M.dark, x, 0.04, z, 0.4, 0.06, 0.4, false)); } }

export function buildBuilding(type, owner) {
  const g = new THREE.Group();
  const anim = {};
  switch (type) {
    case 'towncenter': {
      g.add(plinth(6.2));
      g.add(mesh(G.box, M.turf, 0, 0.1, 0, 5.4, 0.2, 5.4));
      // low stepped stands along both sidelines, field stays open to the sky
      for (const side of [-1, 1]) {
        for (let t = 0; t < 3; t++) {
          const depth = 0.36, z = side * (2.1 + t * depth), h = 0.55 + t * 0.55;
          g.add(mesh(G.box, M.concrete, 0, h / 2, z, 5.8, h, depth));
          g.add(mesh(G.box, M.stands[owner], 0, h + 0.05, z, 5.6, 0.1, depth - 0.06, false));
        }
        g.add(mesh(G.box, M.concrete, 0, 0.9, side * 3.35, 5.8, 1.8, 0.12)); // back wall
        const roof = mesh(G.box, M.darkSteel, 0, 2.75, side * 2.75, 6.0, 0.12, 1.5); g.add(roof);
        for (const x of [-2.7, 0, 2.7]) g.add(mesh(G.cyl, M.darkSteel, x, 2.3, side * 3.3, 0.08, 0.9, 0.08));
        g.add(mesh(G.box, M.trim[owner], 0, 2.82, side * 2.02, 6.0, 0.16, 0.06, false)); // roof fascia in team colour
      }
      g.add(goalPost(0, -2.35, 0));
      g.add(goalPost(0, 2.35, Math.PI));
      for (const [x, z] of [[-3.1, -3.1], [3.1, -3.1], [-3.1, 3.1], [3.1, 3.1]]) g.add(lightPole(x, z, 7));
      // scoreboard on the end line
      const sb = new THREE.Group(); sb.position.set(-2.9, 0, 0); sb.rotation.y = Math.PI / 2;
      sb.add(mesh(G.cyl, M.darkSteel, 0, 1.9, 0, 0.14, 3.8, 0.14));
      sb.add(mesh(G.box, M.dark, 0, 4.4, 0, 2.6, 1.3, 0.25));
      sb.add(mesh(G.box, M.scoreboard, 0, 4.4, 0.14, 2.3, 1.0, 0.04, false));
      g.add(sb);
      g.add(flag(owner, 2.9, 0, 0, 5.6));
      break;
    }
    case 'house': {
      g.add(plinth(3.9));
      g.add(mesh(G.box, M.brick, 0, 1.15, 0, 3.4, 2.3, 3.4));
      g.add(mesh(G.box, M.concrete, 0, 2.34, 0, 3.6, 0.14, 3.6));
      g.add(mesh(G.box, M.steel, 0.9, 2.65, -0.8, 0.9, 0.5, 0.9)); // rooftop AC unit
      g.add(mesh(G.box, M.trim[owner], 0, 0.9, 1.72, 1.4, 1.8, 0.08)); // team-colour double door
      g.add(mesh(G.box, M.dark, 0, 0.9, 1.77, 0.04, 1.6, 0.03, false));
      g.add(mesh(G.box, M.glass, 1.72, 1.6, 0.4, 0.06, 0.5, 1.0, false));
      g.add(mesh(G.box, M.trim[owner], 0, 2.0, 1.74, 3.2, 0.18, 0.06, false)); // colour band
      g.add(mesh(G.cyl, M.steel, -1.4, 0.9, 1.9, 0.08, 1.8, 0.08)); // bench frame
      g.add(mesh(G.box, M.plank, -1.4, 0.55, 2.0, 0.9, 0.08, 0.35));
      break;
    }
    case 'farm': {
      const turf = mesh(G.box, M.turf, 0, 0.08, 0, 5.7, 0.16, 5.7); turf.castShadow = false; g.add(turf);
      const tent = canopyTent(M.canopy[owner], 2.2, 0.8, 2.0); tent.position.set(-1.7, 0.16, -1.7); g.add(tent);
      g.add(mesh(G.box, M.plank, -1.7, 0.75, -1.7, 1.4, 0.06, 0.7)); // merch table
      g.add(mesh(G.box, M.grill, 1.8, 0.85, -1.9, 0.9, 0.3, 0.55)); // grill
      g.add(mesh(G.cyl, M.grill, 1.8, 0.4, -1.9, 0.06, 0.8, 0.06));
      g.add(mesh(G.box, M.cooler, 1.0, 0.4, -2.2, 0.6, 0.45, 0.4));
      // crowd barrier posts along the front
      for (let i = -2; i <= 2; i++) g.add(mesh(G.cyl, M.steel, i * 1.2, 0.5, 2.7, 0.06, 0.9, 0.06));
      g.add(mesh(G.box, M.trim[owner], 0, 0.85, 2.7, 5.2, 0.06, 0.06, false));
      break;
    }
    case 'mill': {
      g.add(plinth(3.9, M.turfPlain));
      const tent = canopyTent(M.canopy[owner], 3.6, 1.6, 2.6); g.add(tent);
      g.add(mesh(G.box, M.plank, 0, 0.8, 0.6, 2.4, 0.08, 0.8)); // check-in table
      g.add(mesh(G.box, M.trim[owner], 0, 0.5, 1.02, 2.4, 0.5, 0.04, false)); // table skirt
      g.add(mesh(G.box, M.white, -0.7, 1.05, 0.5, 0.5, 0.4, 0.5)); // sign-up boxes
      g.add(mesh(G.box, M.white, 0.5, 1.0, 0.5, 0.4, 0.3, 0.4));
      g.add(flag(owner, 1.6, 0, -1.4, 3.6));
      break;
    }
    case 'lumbercamp': {
      g.add(plinth(3.9));
      for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) g.add(mesh(G.cyl, M.darkSteel, x, 1.4, z, 0.14, 2.8, 0.14));
      const roof = new THREE.Mesh(prismRoof(4.0, 4.0, 1.0), M.steel); roof.position.y = 2.8; roof.castShadow = true; g.add(roof);
      const stack = new THREE.Mesh(palletGeometriesA().crates, M.crate); stack.position.set(-0.3, 0.1, -0.2); stack.castShadow = true; g.add(stack);
      g.add(mesh(G.box, M.plank, -0.3, 0.08, -0.2, 2.2, 0.16, 2.2));
      g.add(mesh(G.cyl, M.darkSteel, 1.4, 0.6, 1.2, 0.5, 1.2, 0.5)); // ball bin
      g.add(mesh(G.football, M.football, 1.4, 1.25, 1.2, 1, 1, 1));
      g.add(mesh(G.football, M.football, 1.25, 1.3, 1.05, 1, 1, 1).rotateY(1.2));
      break;
    }
    case 'miningcamp': {
      g.add(plinth(3.9));
      g.add(mesh(G.box, M.concrete, 0, 1.1, -0.4, 3.4, 2.2, 2.6));
      g.add(mesh(G.box, M.darkSteel, 0, 2.25, -0.4, 3.6, 0.12, 2.8));
      // striped awning over the front counter
      const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), M.canopyBooster); awn.position.set(0, 2.0, 1.55); awn.rotation.x = -Math.PI / 2 + 0.5; awn.castShadow = true; g.add(awn);
      g.add(mesh(G.box, M.plank, 0, 0.9, 1.3, 3.0, 0.1, 0.6)); // counter
      g.add(mesh(G.box, M.white, 0, 0.45, 1.3, 3.0, 0.8, 0.5));
      g.add(mesh(G.box, M.glass, 0, 1.4, 0.92, 2.4, 0.7, 0.04, false)); // window
      g.add(mesh(G.box, M.goal, 0, 2.6, 0.9, 1.6, 0.5, 0.1)); // "BOOSTERS" sign
      g.add(mesh(G.cyl, M.steel, -1.5, 0.4, 1.6, 0.1, 0.8, 0.1)); // rope stands
      g.add(mesh(G.cyl, M.steel, 1.5, 0.4, 1.6, 0.1, 0.8, 0.1));
      break;
    }
    case 'barracks': {
      g.add(plinth(6.2));
      g.add(mesh(G.box, M.concrete, 0, 1.6, 0, 5.6, 3.2, 5.6));
      g.add(mesh(G.box, M.darkSteel, 0, 3.28, 0, 5.8, 0.16, 5.8));
      g.add(mesh(G.box, M.hazard, 0, 1.35, 2.82, 2.6, 2.6, 0.08)); // roll-up door
      g.add(mesh(G.box, M.trim[owner], 0, 2.9, 2.84, 5.4, 0.35, 0.06, false)); // colour band
      g.add(mesh(G.box, M.glass, 2.82, 2.2, 0, 0.06, 0.8, 3.6, false));
      // outdoor rack with a barbell and plates
      g.add(mesh(G.box, M.darkSteel, -2.2, 0.9, 3.5, 0.16, 1.8, 0.16)); g.add(mesh(G.box, M.darkSteel, 2.2, 0.9, 3.5, 0.16, 1.8, 0.16));
      g.add(mesh(G.cyl, M.steel, 0, 1.6, 3.5, 0.05, 4.2, 0.05).rotateZ(Math.PI / 2));
      for (const x of [-1.6, -1.45, 1.45, 1.6]) g.add(mesh(G.cyl, M.dark, x, 1.6, 3.5, 0.45, 0.12, 0.45).rotateZ(Math.PI / 2));
      g.add(mesh(G.box, M.dark, 0, 0.2, 3.5, 4.6, 0.1, 1.6, false)); // rubber mat
      g.add(flag(owner, 2.6, 3.3, -2.4, 2.6));
      break;
    }
    case 'archeryrange': {
      g.add(plinth(6.2, M.turfPlain));
      const turf = mesh(G.box, M.turf, 0, 0.08, 0.6, 5.6, 0.16, 4.2); turf.castShadow = false; g.add(turf);
      // passing target net at the far end
      g.add(mesh(G.box, M.darkSteel, -1.6, 1.4, -2.4, 0.12, 2.8, 0.12)); g.add(mesh(G.box, M.darkSteel, 1.6, 1.4, -2.4, 0.12, 2.8, 0.12));
      g.add(mesh(G.box, M.darkSteel, 0, 2.8, -2.4, 3.3, 0.12, 0.12));
      const net = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.4), M.canopy[owner]); net.position.set(0, 1.5, -2.4); net.castShadow = true; g.add(net);
      for (const [x, y] of [[-0.9, 2.0], [0.9, 2.0], [0, 1.0]]) g.add(mesh(G.cyl, M.white, x, y, -2.32, 0.5, 0.04, 0.5).rotateX(Math.PI / 2));
      // ball rack + coach's tent
      g.add(mesh(G.cyl, M.darkSteel, 2.2, 0.55, 2.0, 0.5, 1.1, 0.5));
      g.add(mesh(G.football, M.football, 2.2, 1.18, 2.0, 1, 1, 1));
      const tent = canopyTent(M.canopy[owner], 1.8, 0.6, 2.0); tent.position.set(-2.0, 0.1, 2.0); g.add(tent);
      cones(g, [[-1.2, 1.6], [0, 1.6], [1.2, 1.6]]);
      break;
    }
    case 'stable': {
      g.add(plinth(6.2, M.turfPlain));
      const turf = mesh(G.box, M.turf, 0, 0.08, 0, 5.6, 0.16, 5.6); turf.castShadow = false; g.add(turf);
      cones(g, [[-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [-2, 0.4], [0, 0.4], [2, 0.4]]);
      // tackling dummies in team colours
      for (const x of [-1.6, -0.55, 0.55, 1.6]) {
        g.add(mesh(G.cyl, M.trim[owner], x, 0.95, 1.8, 0.42, 1.5, 0.42));
        g.add(mesh(G.cyl, M.dark, x, 0.15, 1.8, 0.5, 0.12, 0.5));
      }
      // agility ladder
      for (let i = 0; i < 6; i++) g.add(mesh(G.box, M.goal, -1.6 + i * 0.6, 0.18, -0.8, 0.05, 0.03, 1.0, false));
      g.add(mesh(G.box, M.goal, 0, 0.18, -0.3, 3.6, 0.03, 0.05, false)); g.add(mesh(G.box, M.goal, 0, 0.18, -1.3, 3.6, 0.03, 0.05, false));
      g.add(flag(owner, 2.6, 0.16, -2.6, 3.2));
      break;
    }
    case 'tower': {
      g.add(mesh(G.cyl, M.concrete, 0, -0.8, 0, 2.0, 1.6, 2.0));
      g.add(mesh(G.cyl, M.hazard, 0, 0.15, 0, 1.6, 0.3, 1.6));
      // tripod
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        const leg = mesh(G.cyl, M.darkSteel, Math.cos(a) * 0.55, 1.3, Math.sin(a) * 0.55, 0.08, 2.4, 0.08);
        leg.rotation.z = Math.cos(a) * 0.35; leg.rotation.x = -Math.sin(a) * 0.35; g.add(leg);
      }
      const head = new THREE.Group(); head.position.y = 2.7; g.add(head); anim.spin = null;
      head.add(mesh(G.box, M.steel, 0, 0.3, 0, 1.2, 0.8, 1.0));
      head.add(mesh(G.box, M.hazard, 0, 0.3, 0.51, 1.0, 0.5, 0.04, false));
      head.add(mesh(G.cyl, M.darkSteel, 0.0, 0.5, 0.9, 0.22, 1.0, 0.22).rotateX(Math.PI / 2 - 0.3)); // launcher barrel
      const wheel = mesh(G.cyl, M.dark, 0.7, 0.3, 0, 0.5, 0.12, 0.5); wheel.rotation.z = Math.PI / 2; head.add(wheel);
      const wheel2 = wheel.clone(); wheel2.position.x = -0.7; head.add(wheel2);
      anim.wheels = [wheel, wheel2];
      head.add(mesh(G.football, M.football, 0, 0.85, -0.2, 1, 1, 1));
      head.add(mesh(G.box, M.darkSteel, 0, 0.9, -0.35, 0.5, 0.1, 0.9)); // ball hopper
      break;
    }
  }
  g.userData.anim = anim;
  // construction fencing (shown while the facility is being built)
  const size = { towncenter: 6, house: 4, farm: 6, mill: 4, lumbercamp: 4, miningcamp: 4, barracks: 6, archeryrange: 6, stable: 6, tower: 2 }[type] || 4;
  const scaffold = new THREE.Group();
  const hs = size / 2 + 0.3;
  for (const [x, z] of [[-hs, -hs], [hs, -hs], [-hs, hs], [hs, hs]]) scaffold.add(mesh(G.box, M.darkSteel, x, 1.0, z, 0.12, 2, 0.12));
  scaffold.add(mesh(G.box, M.scaffold, 0, 1.4, -hs, size + 0.6, 0.35, 0.06)); scaffold.add(mesh(G.box, M.scaffold, 0, 1.4, hs, size + 0.6, 0.35, 0.06));
  scaffold.add(mesh(G.box, M.scaffold, -hs, 1.4, 0, 0.06, 0.35, size + 0.6)); scaffold.add(mesh(G.box, M.scaffold, hs, 1.4, 0, 0.06, 0.35, size + 0.6));
  scaffold.visible = false;
  g.add(scaffold);
  g.userData.scaffold = scaffold;
  const structure = new THREE.Group();
  for (const child of [...g.children]) if (child !== scaffold) { g.remove(child); structure.add(child); }
  g.add(structure);
  g.userData.structure = structure;
  return g;
}

export const BUILDING_HEIGHT = { towncenter: 7.2, house: 3.6, farm: 3.2, mill: 4.6, lumbercamp: 4.0, miningcamp: 3.4, barracks: 4.2, archeryrange: 3.4, stable: 3.6, tower: 4.4 };
export const UNIT_HEIGHT = { villager: 2.0, militia: 2.2, archer: 2.1, knight: 2.3 };
