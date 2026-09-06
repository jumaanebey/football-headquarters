// Procedurally generated textures (no external assets needed).
import * as THREE from 'three';
import { Noise, mulberry32 } from './noise.js';

const cache = {};
const texNoise = new Noise(4242);

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Generic per-pixel painter: fn(u, v, nx, ny) returns [r,g,b,a] in 0..1 (a optional)
function paint(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const col = fn(u, v, x, y);
      const i = (y * size + x) * 4;
      d[i] = clamp01(col[0]) * 255; d[i + 1] = clamp01(col[1]) * 255; d[i + 2] = clamp01(col[2]) * 255;
      d[i + 3] = (col[3] === undefined ? 1 : clamp01(col[3])) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// tileable fbm using 4D-ish trick: sample noise on a torus via two circles
function tnoise(u, v, scale, oct = 3) {
  const a = u * Math.PI * 2, b = v * Math.PI * 2;
  const r = scale;
  const x = Math.cos(a) * r, y = Math.sin(a) * r, z = Math.cos(b) * r, w = Math.sin(b) * r;
  // fold 4 coords into 2 noise calls
  return 0.5 * texNoise.fbm(x + z * 0.7, y + w * 0.7, oct) + 0.5 * texNoise.fbm(z - x * 0.3 + 31.7, w - y * 0.3 + 17.3, oct);
}

function finalize(canvas, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function grassTexture() {
  if (cache.grass) return cache.grass;
  const size = 512;
  const c = paint(size, (u, v) => {
    const n = tnoise(u, v, 6, 4);
    const n2 = tnoise(u + 0.5, v + 0.2, 24, 2);
    const g = 0.36 + n * 0.14 + n2 * 0.08;
    return [g * 0.55 + 0.02, g, g * 0.32];
  });
  // blade strokes
  const ctx = c.getContext('2d');
  const rnd = mulberry32(7);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * size, y = rnd() * size;
    const l = 3 + rnd() * 7;
    const shade = 0.25 + rnd() * 0.35;
    ctx.strokeStyle = `rgba(${Math.floor(60 + shade * 70)},${Math.floor(90 + shade * 120)},${Math.floor(30 + shade * 40)},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 3, y - l); ctx.stroke();
  }
  cache.grass = finalize(c);
  return cache.grass;
}

export function dirtTexture() {
  if (cache.dirt) return cache.dirt;
  const c = paint(512, (u, v) => {
    const n = tnoise(u, v, 5, 4);
    const n2 = tnoise(u + 0.3, v + 0.7, 30, 2);
    const b = 0.42 + n * 0.16 + n2 * 0.07;
    return [b * 1.0, b * 0.78, b * 0.55];
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(11);
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 1 + rnd() * 3;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(70,55,40,0.45)' : 'rgba(170,150,120,0.35)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  cache.dirt = finalize(c);
  return cache.dirt;
}

export function rockTexture() {
  if (cache.rock) return cache.rock;
  const c = paint(512, (u, v) => {
    const n = tnoise(u, v, 4, 5);
    const n2 = Math.abs(tnoise(u * 2, v * 2, 9, 3));
    const g = 0.45 + n * 0.18 - n2 * 0.25;
    return [g * 0.95, g * 0.93, g * 0.9];
  });
  cache.rock = finalize(c);
  return cache.rock;
}

export function sandTexture() {
  if (cache.sand) return cache.sand;
  const c = paint(256, (u, v) => {
    const n = tnoise(u, v, 6, 3);
    const g = 0.72 + n * 0.1;
    return [g, g * 0.9, g * 0.68];
  });
  cache.sand = finalize(c);
  return cache.sand;
}

export function barkTexture() {
  if (cache.bark) return cache.bark;
  const c = paint(256, (u, v) => {
    const n = tnoise(u * 3, v, 3, 3);
    const stripes = Math.sin(u * Math.PI * 2 * 12 + n * 4) * 0.5 + 0.5;
    const b = 0.22 + stripes * 0.14 + n * 0.08;
    return [b * 1.1, b * 0.82, b * 0.6];
  });
  cache.bark = finalize(c);
  return cache.bark;
}

export function leafTexture() {
  if (cache.leaf) return cache.leaf;
  const c = paint(256, (u, v) => {
    const n = tnoise(u, v, 8, 3);
    const n2 = tnoise(u + 0.4, v + 0.6, 30, 2);
    const g = 0.32 + n * 0.14 + n2 * 0.1;
    return [g * 0.45 + 0.02, g, g * 0.3];
  });
  cache.leaf = finalize(c);
  return cache.leaf;
}

export function grassBladeTexture() {
  if (cache.blade) return cache.blade;
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rnd = mulberry32(99);
  for (let i = 0; i < 14; i++) {
    const x0 = 10 + rnd() * (size - 20);
    const w = 5 + rnd() * 6;
    const h = size * (0.55 + rnd() * 0.45);
    const lean = (rnd() - 0.5) * 30;
    const shade = 0.5 + rnd() * 0.5;
    const grad = ctx.createLinearGradient(0, size, 0, size - h);
    grad.addColorStop(0, `rgb(${Math.floor(50 * shade)},${Math.floor(95 * shade)},${Math.floor(35 * shade)})`);
    grad.addColorStop(1, `rgb(${Math.floor(110 * shade)},${Math.floor(170 * shade)},${Math.floor(60 * shade)})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0 - w / 2, size);
    ctx.quadraticCurveTo(x0 - w / 2 + lean * 0.3, size - h * 0.6, x0 + lean, size - h);
    ctx.quadraticCurveTo(x0 + w / 2 + lean * 0.3, size - h * 0.6, x0 + w / 2, size);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.blade = t;
  return t;
}

export function stoneWallTexture() {
  if (cache.stoneWall) return cache.stoneWall;
  const size = 512;
  const c = paint(size, (u, v) => {
    const n = tnoise(u, v, 6, 3);
    const g = 0.6 + n * 0.1;
    return [g * 0.9, g * 0.87, g * 0.8];
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(5);
  const rows = 10, bh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -30;
    while (x < size) {
      const bw = 40 + rnd() * 50;
      const shade = 0.5 + rnd() * 0.3;
      ctx.fillStyle = `rgb(${Math.floor(150 * shade + 40)},${Math.floor(140 * shade + 38)},${Math.floor(125 * shade + 35)})`;
      ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      // bevel
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 2, r * bh + 2, bw - 4, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 2, r * bh + bh - 6, bw - 4, 4);
      x += bw;
    }
  }
  // mortar noise overlay
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % size, py = Math.floor(i / 4 / size);
    const n = tnoise(px / size, py / size, 20, 2) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  cache.stoneWall = finalize(c);
  return cache.stoneWall;
}

export function plasterTexture() {
  if (cache.plaster) return cache.plaster;
  const c = paint(256, (u, v) => {
    const n = tnoise(u, v, 7, 3);
    const g = 0.78 + n * 0.08;
    return [g, g * 0.95, g * 0.85];
  });
  cache.plaster = finalize(c);
  return cache.plaster;
}

export function woodPlankTexture() {
  if (cache.plank) return cache.plank;
  const size = 256;
  const c = paint(size, (u, v) => {
    const plank = Math.floor(v * 6);
    const pv = (v * 6) % 1;
    const n = tnoise(u * 2 + plank * 0.37, v * 0.3, 3, 3);
    const grain = Math.sin(u * 60 + n * 8 + plank) * 0.06;
    let b = 0.45 + n * 0.1 + grain + (plank % 2) * 0.03;
    if (pv < 0.05 || pv > 0.96) b *= 0.55;
    return [b * 1.05, b * 0.74, b * 0.48];
  });
  cache.plank = finalize(c);
  return cache.plank;
}

export function thatchTexture() {
  if (cache.thatch) return cache.thatch;
  const c = paint(256, (u, v) => {
    const n = tnoise(u * 4, v, 2, 3);
    const strands = Math.sin(u * Math.PI * 2 * 40 + n * 3) * 0.5 + 0.5;
    const layer = ((v * 8) % 1) < 0.12 ? 0.7 : 1.0;
    const b = (0.5 + strands * 0.15 + n * 0.1) * layer;
    return [b * 1.05, b * 0.82, b * 0.45];
  });
  cache.thatch = finalize(c);
  return cache.thatch;
}

export function roofTileTexture() {
  if (cache.tile) return cache.tile;
  const size = 256;
  const c = paint(size, (u, v) => {
    const row = Math.floor(v * 10);
    const uu = (u + (row % 2) * 0.5) * 10 % 1;
    const vv = (v * 10) % 1;
    const curve = Math.cos((uu - 0.5) * Math.PI) * 0.25;
    const edge = vv < 0.15 ? 0.6 : 1.0;
    const n = tnoise(u, v, 6, 2);
    const b = (0.45 + curve + n * 0.08) * edge;
    return [b * 0.95, b * 0.5, b * 0.38];
  });
  cache.tile = finalize(c);
  return cache.tile;
}

export function farmTexture() {
  if (cache.farm) return cache.farm;
  const c = paint(256, (u, v) => {
    const rows = Math.sin(v * Math.PI * 2 * 8);
    const n = tnoise(u, v, 8, 3);
    const soil = 0.35 + n * 0.08;
    const crop = 0.4 + n * 0.15;
    const m = clamp01(rows * 1.5 + 0.3);
    return [soil * (1 - m) * 1.0 + m * crop * 0.85, soil * (1 - m) * 0.7 + m * crop * 1.2, soil * (1 - m) * 0.45 + m * crop * 0.35];
  });
  cache.farm = finalize(c);
  return cache.farm;
}

export function clothTexture(hex) {
  const key = 'cloth' + hex;
  if (cache[key]) return cache[key];
  const col = new THREE.Color(hex);
  const c = paint(64, (u, v) => {
    const n = tnoise(u, v, 4, 2) * 0.12;
    return [col.r + n, col.g + n, col.b + n];
  });
  cache[key] = finalize(c);
  return cache[key];
}

export function goldOreTexture() {
  if (cache.gold) return cache.gold;
  const c = paint(256, (u, v) => {
    const n = tnoise(u, v, 4, 4);
    const veins = Math.max(0, 1 - Math.abs(tnoise(u * 3, v * 3, 7, 2)) * 6);
    const g = 0.4 + n * 0.15;
    return [g * 0.9 + veins * 0.6, g * 0.85 + veins * 0.45, g * 0.8];
  });
  cache.gold = finalize(c);
  return cache.gold;
}

export function berryTexture() {
  if (cache.berry) return cache.berry;
  const c = paint(128, (u, v) => {
    const n = tnoise(u, v, 8, 3);
    const g = 0.3 + n * 0.12;
    const dots = tnoise(u * 2, v * 2, 25, 1) > 0.42 ? 1 : 0;
    return [g * 0.4 + dots * 0.5, g + dots * -0.2, g * 0.3 + dots * 0.05];
  });
  cache.berry = finalize(c);
  return cache.berry;
}

export function skinTexture() {
  if (cache.skin) return cache.skin;
  const c = paint(32, (u, v) => {
    const n = tnoise(u, v, 3, 2) * 0.05;
    return [0.85 + n, 0.65 + n, 0.5 + n];
  });
  cache.skin = finalize(c);
  return cache.skin;
}

export function metalTexture() {
  if (cache.metal) return cache.metal;
  const c = paint(64, (u, v) => {
    const n = tnoise(u, v, 5, 3) * 0.12;
    return [0.62 + n, 0.64 + n, 0.68 + n];
  });
  cache.metal = finalize(c);
  return cache.metal;
}

export function smokeTexture() {
  if (cache.smoke) return cache.smoke;
  const size = 64;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  cache.smoke = t;
  return t;
}

// ---------- football additions ----------
export function turfLinesTexture() {
  if (cache.turf) return cache.turf;
  const size = 512;
  const c = paint(size, (u, v) => {
    const n = tnoise(u, v, 6, 3);
    const n2 = tnoise(u + 0.3, v + 0.7, 26, 2);
    // mowing stripes
    const stripe = Math.floor(v * 8) % 2 ? 0.05 : 0;
    const g = 0.42 + n * 0.08 + n2 * 0.05 + stripe;
    return [g * 0.45, g, g * 0.42];
  });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i <= 5; i++) { const y = Math.round(i * (size / 5)); ctx.fillRect(0, Math.min(size - 4, y), size, 4); }
  // hash marks
  for (let i = 0; i < 5; i++) for (let k = 1; k < 5; k++) {
    const y = i * (size / 5) + k * (size / 25);
    ctx.fillRect(size * 0.3, y, 14, 3); ctx.fillRect(size * 0.7 - 14, y, 14, 3);
  }
  cache.turf = finalize(c);
  return cache.turf;
}

export function hazardTexture() {
  if (cache.hazard) return cache.hazard;
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#facc15'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#111827';
  for (let i = -size; i < size * 2; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i + 16 + size, size); ctx.lineTo(i + size, size); ctx.closePath(); ctx.fill();
  }
  cache.hazard = finalize(c);
  return cache.hazard;
}

export function jerseyTexture(baseHex, trimHex) {
  const key = 'jersey' + baseHex + trimHex;
  if (cache[key]) return cache[key];
  const base = new THREE.Color(baseHex), trim = new THREE.Color(trimHex);
  const c = paint(64, (u, v) => {
    const n = tnoise(u, v, 4, 2) * 0.05;
    const band = (v > 0.12 && v < 0.2) || (v > 0.24 && v < 0.28);
    const col = band ? trim : base;
    return [col.r + n, col.g + n, col.b + n];
  });
  cache[key] = finalize(c);
  return cache[key];
}

export function canopyTexture(hexA, hexB) {
  const key = 'canopy' + hexA + hexB;
  if (cache[key]) return cache[key];
  const a = new THREE.Color(hexA), b = new THREE.Color(hexB);
  const c = paint(128, (u, v) => {
    const n = tnoise(u, v, 5, 2) * 0.04;
    const col = Math.floor(u * 8) % 2 ? a : b;
    return [col.r + n, col.g + n, col.b + n];
  });
  cache[key] = finalize(c);
  return cache[key];
}

export function crateTexture() {
  if (cache.crate) return cache.crate;
  const size = 256;
  const c = paint(size, (u, v) => {
    const n = tnoise(u, v, 6, 3);
    const g = 0.62 + n * 0.08;
    return [g * 1.0, g * 0.78, g * 0.5];
  });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(40,40,40,0.55)';
  ctx.fillRect(0, size * 0.46, size, size * 0.08); // strap
  ctx.fillRect(size * 0.46, 0, size * 0.08, size);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('EQUIPMENT', size / 2, size * 0.32);
  ctx.fillStyle = '#f97316'; ctx.fillRect(size * 0.15, size * 0.66, size * 0.7, 6);
  cache.crate = finalize(c);
  return cache.crate;
}

export function standsTexture(hex) {
  const key = 'stands' + hex;
  if (cache[key]) return cache[key];
  const col = new THREE.Color(hex);
  const c = paint(128, (u, v) => {
    const row = Math.floor(v * 10) % 2;
    const seat = Math.floor(u * 24) % 2;
    const n = tnoise(u, v, 8, 2) * 0.05;
    // seats in team colour with a grey aisle row
    if (row) return [0.62 + n, 0.64 + n, 0.66 + n];
    const f = seat ? 1.0 : 0.72;
    return [col.r * f + n, col.g * f + n, col.b * f + n];
  });
  cache[key] = finalize(c);
  return cache[key];
}

export function footballTexture() {
  if (cache.football) return cache.football;
  const c = paint(64, (u, v) => {
    const n = tnoise(u, v, 4, 2) * 0.05;
    const lace = Math.abs(u - 0.5) < 0.04 && v > 0.3 && v < 0.7;
    const stripe = (v < 0.18 || v > 0.82) && Math.abs(v - 0.5) > 0.3;
    if (lace) return [0.95, 0.95, 0.95];
    if (stripe) return [0.9, 0.9, 0.9];
    return [0.52 + n, 0.27 + n, 0.12 + n];
  });
  cache.football = finalize(c);
  return cache.football;
}
