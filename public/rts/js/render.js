// Three.js scene: terrain, water, sky, vegetation, entity views, effects, camera rig, picking.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_SIZE, CELL, GRID, WATER_LEVEL, PLAYER, ENEMY, UNITS, BUILDINGS, OWNER_COLORS } from './config.js';
import { HRES } from './world.js';
import * as T from './textures.js';
import { M, G, initMaterials, buildUnit, buildBuilding, palletGeometriesA, palletGeometriesB, boosterTentGeometry, turfPileGeometry, tailgateGeometry, BUILDING_HEIGHT, UNIT_HEIGHT } from './models.js';
import { Noise, mulberry32 } from './noise.js';
import { buildingHalf } from './game.js';

const HALF = MAP_SIZE / 2;

export class Renderer {
  constructor(canvas, game) {
    this.game = game;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfd8e3, 180, 520);
    this.camera = new THREE.PerspectiveCamera(48, 1, 1, 1200);
    this.rig = { x: 0, z: 0, yaw: 0, pitch: 0.95, dist: 62, minDist: 22, maxDist: 150 };

    initMaterials(game.fog);
    this.setupLights();
    this.unitViews = new Map();
    this.buildingViews = new Map();
    this.projectileViews = new Map();
    this.rings = [];
    this.effects = [];
    this.smokes = [];
    this.time = 0;
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.ghost = null;
    this.raycaster = new THREE.Raycaster();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setupLights() {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.8;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 42), THREE.MathUtils.degToRad(150));
    u.sunPosition.value.copy(sunDir);
    this.scene.add(sky);
    this.sunDir = sunDir;

    const sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20; sun.shadow.camera.far = 400;
    const s = 75;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s; sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x6b7a4a, 0.75);
    this.scene.add(hemi);
  }

  // ---------- world ----------
  buildWorld() {
    const g = this.game, w = g.world;
    while (this.worldGroup.children.length) {
      const c = this.worldGroup.children.pop();
      c.geometry?.dispose?.();
    }
    // terrain
    const n = HRES;
    const pos = new Float32Array(n * n * 3), splat = new Float32Array(n * n * 4), uv = new Float32Array(n * n * 2);
    const macro = new Noise(g.seed + 99);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = i - HALF; pos[k * 3 + 1] = w.heights[k]; pos[k * 3 + 2] = j - HALF;
      uv[k * 2] = i / n; uv[k * 2 + 1] = j / n;
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    this.minimapBase = document.createElement('canvas');
    this.minimapBase.width = n; this.minimapBase.height = n;
    const mctx = this.minimapBase.getContext('2d');
    const mimg = mctx.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const h = w.heights[k], slope = 1 - nor.getY(k);
      const x = i - HALF, z = j - HALF;
      const nz = macro.fbm(x * 0.03, z * 0.03, 3);
      let sand = THREE.MathUtils.smoothstep(WATER_LEVEL + 1.6 - h, 0, 1.4);
      let rock = THREE.MathUtils.smoothstep(slope, 0.32, 0.55) + THREE.MathUtils.smoothstep(h, 11, 16);
      let dirt = THREE.MathUtils.smoothstep(slope, 0.16, 0.34) * 0.9 + Math.max(0, nz - 0.25) * 1.5;
      rock = Math.min(1, rock); dirt = Math.min(1, dirt) * (1 - rock);
      let grass = Math.max(0, 1 - rock - dirt);
      const total = grass + dirt + rock + sand || 1;
      grass /= total; dirt /= total; rock /= total; sand /= total;
      splat[k * 4] = grass; splat[k * 4 + 1] = dirt; splat[k * 4 + 2] = rock; splat[k * 4 + 3] = sand;
      const mi = k * 4;
      if (h < WATER_LEVEL) { mimg.data[mi] = 40; mimg.data[mi + 1] = 80; mimg.data[mi + 2] = 140; }
      else {
        const shade = 0.75 + Math.min(0.35, (h + 2) / 30);
        mimg.data[mi] = (grass * 70 + dirt * 130 + rock * 120 + sand * 190) * shade;
        mimg.data[mi + 1] = (grass * 110 + dirt * 100 + rock * 115 + sand * 175) * shade;
        mimg.data[mi + 2] = (grass * 45 + dirt * 60 + rock * 110 + sand * 130) * shade;
      }
      mimg.data[mi + 3] = 255;
    }
    mctx.putImageData(mimg, 0, 0);
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    this.splat = splat;

    const mat = new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0 });
    this.game.fog.apply(mat);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      prev(shader);
      shader.uniforms.grassMap = { value: T.grassTexture() };
      shader.uniforms.dirtMap = { value: T.dirtTexture() };
      shader.uniforms.rockMap = { value: T.rockTexture() };
      shader.uniforms.sandMap = { value: T.sandTexture() };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vSplat;\nuniform sampler2D grassMap;\nuniform sampler2D dirtMap;\nuniform sampler2D rockMap;\nuniform sampler2D sandMap;')
        .replace('#include <map_fragment>', `
          vec2 tuv = vFowWorld.xz * 0.11;
          vec4 gC = texture2D(grassMap, tuv);
          vec4 dC = texture2D(dirtMap, tuv * 0.83);
          vec4 rC = texture2D(rockMap, tuv * 0.6);
          vec4 sC = texture2D(sandMap, tuv * 1.3);
          vec4 texel = gC * vSplat.x + dC * vSplat.y + rC * vSplat.z + sC * vSplat.w;
          float macro = texture2D(grassMap, vFowWorld.xz * 0.009).g;
          float macro2 = texture2D(dirtMap, vFowWorld.xz * 0.021 + 0.3).r;
          texel.rgb *= 0.78 + macro * 0.32 + macro2 * 0.12;
          diffuseColor *= texel;`);
    };
    mat.customProgramCacheKey = () => 'terrain';
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    terrain.castShadow = false;
    this.terrain = terrain;
    this.worldGroup.add(terrain);

    this.buildWater();
    this.buildNodes();
    this.buildGrass();
    // reset entity views
    for (const v of this.unitViews.values()) this.entityGroup.remove(v.group);
    for (const v of this.buildingViews.values()) this.entityGroup.remove(v.group);
    this.unitViews.clear(); this.buildingViews.clear();
    for (const s of this.smokes) this.fxGroup.remove(s.sprite);
    this.smokes = [];
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(MAP_SIZE * 1.6, MAP_SIZE * 1.6, 64, 64);
    geo.rotateX(-Math.PI / 2);
    const fu = this.game.fog.uniforms;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, sunDir: { value: this.sunDir.clone() }, fowMap: fu.fowMap, fowSize: fu.fowSize, fowEnabled: fu.fowEnabled,
        camPos: { value: new THREE.Vector3() },
      }]),
      vertexShader: `
        uniform float time;
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec3 p = position;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          wp.y += sin(wp.x * 0.35 + time * 1.1) * 0.08 + cos(wp.z * 0.28 + time * 0.9) * 0.08;
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float time; uniform vec3 sunDir; uniform vec3 camPos;
        uniform sampler2D fowMap; uniform float fowSize; uniform float fowEnabled;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = vWorld.xz;
          float w1 = sin(p.x * 0.9 + time * 1.7) + sin(p.y * 0.7 - time * 1.3);
          float w2 = sin((p.x + p.y) * 0.45 + time * 0.8);
          vec3 n = normalize(vec3(w1 * 0.08 + cos(p.y * 1.3 + time) * 0.04, 1.0, w2 * 0.08 + cos(p.x * 1.1 - time * 1.2) * 0.04));
          vec3 v = normalize(camPos - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 deep = vec3(0.03, 0.14, 0.25);
          vec3 shallow = vec3(0.12, 0.42, 0.5);
          vec3 skyCol = vec3(0.55, 0.7, 0.9);
          vec3 col = mix(deep, shallow, 0.4 + 0.3 * w2) ;
          col = mix(col, skyCol, fres * 0.7);
          vec3 h = normalize(v + normalize(sunDir));
          float spec = pow(max(dot(n, h), 0.0), 160.0) * 1.6;
          col += spec;
          float fow = texture2D(fowMap, vWorld.xz / fowSize + 0.5).r;
          fow = mix(1.0, fow, fowEnabled);
          col *= smoothstep(-0.05, 0.45, fow) * (0.55 + 0.45 * smoothstep(0.42, 1.0, fow));
          gl_FragColor = vec4(col, 0.88);
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_LEVEL;
    this.water = water;
    this.worldGroup.add(water);
  }

  buildNodes() {
    const g = this.game;
    const nodes = g.nodes;
    const rnd = mulberry32(g.seed + 5);
    const pineNoise = new Noise(g.seed + 7);
    const groups = { tree: [], pine: [], gold: [], stone: [], berry: [] };
    for (const n of nodes) {
      if (n.type === 'tree') {
        const variantB = pineNoise.fbm(n.x * 0.02, n.z * 0.02, 2) > 0.12; // two pallet layouts by area
        groups[variantB ? 'pine' : 'tree'].push(n);
      } else groups[n.type].push(n);
    }
    this.nodeInstances = new Map(); // nodeId -> [{mesh, index}]
    const mk = (geo, mat, list, scaleFn, colorFn) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = true; im.receiveShadow = true;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach((n, i) => {
        const sc = scaleFn(n);
        p.set(n.x, g.heightAt(n.x, n.z) - 0.15, n.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rot);
        s.set(sc, sc * (0.95 + rnd() * 0.1), sc);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
        if (colorFn) im.setColorAt(i, colorFn(n));
        if (!this.nodeInstances.has(n.id)) this.nodeInstances.set(n.id, []);
        this.nodeInstances.get(n.id).push({ mesh: im, index: i });
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.worldGroup.add(im);
      return im;
    };
    const pa = palletGeometriesA(), pb = palletGeometriesB();
    const crateTint = () => new THREE.Color().setHSL(0.09 + rnd() * 0.03, 0.35 + rnd() * 0.2, 0.55 + rnd() * 0.15);
    mk(pa.base, M.plank, groups.tree, n => n.scale);
    mk(pa.crates, M.crate, groups.tree, n => n.scale, crateTint);
    mk(pb.base, M.plank, groups.pine, n => n.scale);
    mk(pb.crates, M.crate, groups.pine, n => n.scale, crateTint);
    const bt = boosterTentGeometry();
    mk(bt.frame, M.steel, groups.gold, n => 0.95 * n.scale);
    mk(bt.canopy, M.canopyBooster, groups.gold, n => 0.95 * n.scale);
    const tp = turfPileGeometry();
    mk(tp.pallet, M.plank, groups.stone, n => n.scale);
    mk(tp.rolls, M.turfRoll, groups.stone, n => n.scale);
    const tg = tailgateGeometry();
    mk(tg.metal, M.grill, groups.berry, n => n.scale);
    mk(tg.cooler, M.cooler, groups.berry, n => n.scale);
    mk(tg.canopy, M.canopyNeutral, groups.berry, n => n.scale);
  }

  removeNodeInstance(id) {
    const list = this.nodeInstances?.get(id);
    if (!list) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { mesh, index } of list) { mesh.setMatrixAt(index, zero); mesh.instanceMatrix.needsUpdate = true; }
    this.nodeInstances.delete(id);
  }

  buildGrass() {
    const g = this.game, w = g.world;
    const count = 18000;
    const quad = new THREE.PlaneGeometry(1.1, 0.75); quad.translate(0, 0.37, 0);
    const quad2 = quad.clone(); quad2.rotateY(Math.PI / 2);
    const quad3 = quad.clone(); quad3.rotateY(Math.PI / 4);
    const geo = mergeGeometries([quad, quad2, quad3]);
    const mat = M.blade;
    if (!mat.userData.windReady) {
      g.fog.apply(mat);
      const prev = mat.onBeforeCompile;
      mat.userData.timeU = { value: 0 };
      mat.onBeforeCompile = (shader) => {
        prev(shader);
        shader.uniforms.time = mat.userData.timeU;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float time;')
          .replace('#include <begin_vertex>', `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float sway = sin(time * 1.7 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(time * 2.9 + ip.z * 0.7) * 0.25;
            transformed.x += sway * uv.y * uv.y * 0.35;
            transformed.z += cos(time * 1.3 + ip.x * 0.2) * uv.y * uv.y * 0.15;
            #endif`);
      };
      mat.customProgramCacheKey = () => 'grass';
      mat.userData.windReady = true;
    }
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = false; im.receiveShadow = true;
    const rnd = mulberry32(g.seed + 77);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const positions = new Float32Array(count * 2);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 6) {
      tries++;
      const x = (rnd() - 0.5) * (MAP_SIZE - 20), z = (rnd() - 0.5) * (MAP_SIZE - 20);
      const c = g.cellOf(x, z);
      if (g.nav.blocked(c.cx, c.cz) || g.placeGrid[c.cz * GRID + c.cx]) continue;
      const i = Math.round(x + HALF), j = Math.round(z + HALF);
      const k = j * HRES + i;
      if (this.splat[k * 4] < 0.55 || rnd() > this.splat[k * 4]) continue;
      const h = g.heightAt(x, z);
      p.set(x, h - 0.05, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      const sc = 0.8 + rnd() * 0.9;
      s.set(sc, sc * (0.8 + rnd() * 0.6), sc);
      m.compose(p, q, s);
      im.setMatrixAt(placed, m);
      positions[placed * 2] = x; positions[placed * 2 + 1] = z;
      placed++;
    }
    im.count = placed;
    im.instanceMatrix.needsUpdate = true;
    this.grass = im; this.grassPositions = positions;
    this.worldGroup.add(im);
    // hide grass under existing buildings
    for (const b of g.buildings) this.clearGrassUnder(b);
  }

  clearGrassUnder(b) {
    if (!this.grass) return;
    const h = buildingHalf(b) + 0.3;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let any = false;
    for (let i = 0; i < this.grass.count; i++) {
      const x = this.grassPositions[i * 2], z = this.grassPositions[i * 2 + 1];
      if (Math.abs(x - b.x) < h && Math.abs(z - b.z) < h) { this.grass.setMatrixAt(i, zero); any = true; }
    }
    if (any) this.grass.instanceMatrix.needsUpdate = true;
  }

  // ---------- entity views ----------
  syncEntities(dt) {
    const g = this.game, fog = g.fog;
    const seen = new Set();
    for (const u of g.units) {
      seen.add(u.id);
      let v = this.unitViews.get(u.id);
      if (!v) {
        const group = buildUnit(u.type, u.owner);
        group.userData.id = u.id;
        this.entityGroup.add(group);
        v = { group, parts: group.userData.parts, type: u.type, owner: u.owner, smoothX: u.x, smoothZ: u.z };
        this.unitViews.set(u.id, v);
      }
      const visible = u.owner === PLAYER || fog.isVisible(u.x, u.z);
      v.group.visible = visible;
      if (!visible) continue;
      // smooth position a bit to hide tick jitter
      v.smoothX += (u.x - v.smoothX) * Math.min(1, dt * 18);
      v.smoothZ += (u.z - v.smoothZ) * Math.min(1, dt * 18);
      const y = g.heightAt(v.smoothX, v.smoothZ);
      v.group.position.set(v.smoothX, y, v.smoothZ);
      // smooth rotation
      let dr = u.rot - v.group.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      v.group.rotation.y += dr * Math.min(1, dt * 12);
      this.animateUnit(v, u);
    }
    for (const [id, v] of this.unitViews) if (!seen.has(id)) { this.entityGroup.remove(v.group); this.unitViews.delete(id); }

    const seenB = new Set();
    for (const b of g.buildings) {
      seenB.add(b.id);
      let v = this.buildingViews.get(b.id);
      if (!v) {
        const group = buildBuilding(b.type, b.owner);
        group.userData.id = b.id;
        // average terrain height under footprint
        const h = buildingHalf(b) * 0.8;
        let y = 0;
        for (const [dx, dz] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) y += g.heightAt(b.x + dx, b.z + dz);
        y /= 5;
        group.position.set(b.x, y + 0.02, b.z);
        this.entityGroup.add(group);
        v = { group, type: b.type, owner: b.owner, y };
        this.buildingViews.set(b.id, v);
        this.clearGrassUnder(b);
      }
      const visible = b.owner === PLAYER || b.seen;
      v.group.visible = visible;
      if (!visible) continue;
      const st = v.group.userData.structure, sc = v.group.userData.scaffold;
      if (!b.complete) {
        const p = Math.max(0.04, b.progress);
        st.scale.y = p; st.position.y = 0;
        sc.visible = true;
      } else { st.scale.y = 1; sc.visible = false; }
      const anim = v.group.userData.anim;
      if (anim.wheels && b.complete) for (const w of anim.wheels) w.rotation.y += dt * 6;
      // banners wave
      v.group.traverse(o => { if (o.userData.flag) o.userData.flag.rotation.y = Math.sin(this.time * 2.2 + b.id) * 0.3; });
      // a facility that is being worked droops and leans (no smoke, no fire)
      const def = BUILDINGS[b.type];
      if (b.complete) {
        const frac = Math.max(0, Math.min(1, b.hp / def.hp));
        st.scale.y = 0.78 + 0.22 * frac;
        st.rotation.z = (1 - frac) * 0.05 * Math.sin(b.id);
        const recent = this.game.time - (b.lastHit || -99);
        if (recent < 0.25) st.position.x = Math.sin(recent * 60) * 0.06 * (1 - recent / 0.25); else st.position.x = 0;
      }
    }
    for (const [id, v] of this.buildingViews) if (!seenB.has(id)) { this.entityGroup.remove(v.group); this.buildingViews.delete(id); }

    // projectiles: footballs (spiralling) and t-shirts (tumbling)
    const live = new Set();
    for (const p of g.projectiles) {
      live.add(p.id);
      let m = this.projectileViews.get(p.id);
      if (!m) {
        m = p.kind === 'tshirt' ? new THREE.Mesh(G.tshirt, M.tshirt[p.owner]) : new THREE.Mesh(G.football, M.football);
        m.castShadow = false; this.fxGroup.add(m); this.projectileViews.set(p.id, m);
      }
      const t = Math.min(1, p.t / p.dur);
      const x = p.sx + (p.tx - p.sx) * t, z = p.sz + (p.tz - p.sz) * t;
      const y0 = p.y, y1 = g.heightAt(p.tx, p.tz) + 1.0;
      const arc = Math.hypot(p.tx - p.sx, p.tz - p.sz) * 0.2;
      const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * arc;
      m.visible = fog.isVisible(x, z);
      const px = m.position.x, py = m.position.y, pz = m.position.z;
      m.position.set(x, y, z);
      if (p.kind === 'tshirt') { m.rotation.x += dt * 9; m.rotation.y += dt * 5; }
      else if (m.visible && p.t > 0.02) { m.lookAt(px + (x - px) * 2, py + (y - py) * 2, pz + (z - pz) * 2); m.rotateZ(this.time * 25); }
    }
    for (const [id, m] of this.projectileViews) if (!live.has(id)) { this.fxGroup.remove(m); this.projectileViews.delete(id); }
  }

  animateUnit(v, u) {
    const p = v.parts, def = UNITS[u.type];
    const t = u.animT;
    const setLegs = (a) => { p.legL.rotation.x = a; p.legR.rotation.x = -a; };
    const setArms = (l, r) => { p.armL.rotation.x = l; p.armR.rotation.x = r; };
    if (p.sack) p.sack.visible = !!(u.carry && u.carry.amt > 0.5);
    p.body.position.y = 0; p.body.position.z = 0;
    p.torso.rotation.x = 0;
    p.torso.rotation.y = 0;
    if (p.tool && u.type === 'archer') p.tool.visible = true;
    switch (u.anim) {
      case 'walk': {
        const w = t * def.speed * 1.7;
        setLegs(Math.sin(w) * 0.75);
        p.body.position.y = Math.abs(Math.sin(w)) * (u.type === 'militia' ? 0.09 : 0.06);
        setArms(Math.sin(w) * 0.5, -Math.sin(w) * 0.5);
        if (u.type === 'archer') p.armR.rotation.x = -0.6; // tucks the ball
        break;
      }
      case 'attack': {
        const phase = 1 - u.cooldown / def.cooldown;
        setLegs(0.15);
        if (u.type === 'archer') {
          // throwing motion: wind up, release, follow through
          setArms(-1.2, -2.6 + Math.sin(phase * Math.PI) * 1.9);
          p.torso.rotation.y = -0.5 + phase * 0.6;
          if (p.tool) p.tool.visible = phase < 0.45 || phase > 0.9;
        } else {
          // block / tackle: drive forward with both arms
          const drive = Math.sin(phase * Math.PI);
          setArms(-1.3 + drive * 0.4, -1.3 + drive * 0.4);
          p.torso.rotation.x = 0.35 * drive;
          p.body.position.z = drive * 0.25;
        }
        break;
      }
      case 'chop': case 'build': {
        const s = Math.sin(t * 7);
        setLegs(0.1);
        setArms(-0.3, -2.3 + Math.max(0, s) * 1.6);
        p.torso.rotation.x = 0.15 + Math.max(0, s) * 0.15;
        break;
      }
      case 'gather': {
        const s = Math.sin(t * 3);
        setLegs(0.08);
        p.torso.rotation.x = 0.55 + s * 0.15;
        setArms(-1.2 + s * 0.4, -1.4 - s * 0.4);
        break;
      }
      default: {
        setLegs(0);
        setArms(Math.sin(t * 1.3) * 0.05, -Math.sin(t * 1.3) * 0.05);
        if (u.type === 'archer') p.armR.rotation.x = -0.6;
        if (u.type === 'militia' || u.type === 'knight') setLegs(0.25);
        p.body.position.y = Math.sin(t * 1.6) * 0.012;
      }
    }
  }

  // ---------- effects ----------
  spawnSmoke(x, y, z, fire = false) {
    const mat = new THREE.SpriteMaterial({ map: T.smokeTexture(), color: fire ? 0xff8844 : 0x555555, transparent: true, opacity: 0.55, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z); s.scale.setScalar(1.5);
    this.fxGroup.add(s);
    this.smokes.push({ sprite: s, life: 0, max: 2.4 + Math.random(), fire });
  }
  spawnBurst(x, y, z, color, n = 6, size = 0.5) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: T.smokeTexture(), color, transparent: true, opacity: 0.9, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.6);
      s.scale.setScalar(size);
      this.fxGroup.add(s);
      this.effects.push({ sprite: s, life: 0, max: 0.35 + Math.random() * 0.3, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3 });
    }
  }
  updateEffects(dt) {
    for (const e of [...this.effects]) {
      e.life += dt;
      const k = e.life / e.max;
      if (e.gravity) { e.vy -= e.gravity * dt; e.vx *= (1 - dt * 1.5); e.vz *= (1 - dt * 1.5); }
      e.sprite.position.x += e.vx * dt; e.sprite.position.y += e.vy * dt; e.sprite.position.z += e.vz * dt;
      if (e.confetti) { e.sprite.material.rotation += e.spin * dt; e.sprite.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; }
      else { e.sprite.material.opacity = 0.9 * (1 - k); e.sprite.scale.setScalar(e.sprite.scale.x * (1 + dt * 2)); }
      if (k >= 1) { this.fxGroup.remove(e.sprite); e.sprite.material.dispose(); this.effects.splice(this.effects.indexOf(e), 1); }
    }
    for (const s of [...this.smokes]) {
      s.life += dt;
      const k = s.life / s.max;
      s.sprite.position.y += dt * 1.6; s.sprite.position.x += Math.sin(this.time + s.max) * dt * 0.4;
      s.sprite.scale.setScalar(1.5 + k * 3.5);
      s.sprite.material.opacity = 0.55 * (1 - k) * (s.fire ? 1.2 : 1);
      if (s.fire && k > 0.3) s.sprite.material.color.setHex(0x444444);
      if (k >= 1) { this.fxGroup.remove(s.sprite); s.sprite.material.dispose(); this.smokes.splice(this.smokes.indexOf(s), 1); }
    }
  }

  spawnConfetti(x, y, z, n = 30, size = 0.6) {
    for (let i = 0; i < n; i++) {
      const color = M.confetti[i % M.confetti.length];
      const mat = new THREE.SpriteMaterial({ map: T.smokeTexture(), color, transparent: true, opacity: 1, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.set(x + (Math.random() - 0.5) * 2, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 2);
      s.scale.set(size * 0.6, size * 0.35, 1);
      this.fxGroup.add(s);
      this.effects.push({ sprite: s, life: 0, max: 1.4 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 5, gravity: 9, spin: (Math.random() - 0.5) * 8, confetti: true });
    }
  }

  onGameEvent(ev) {
    if (ev.type === 'nodeRemoved') this.removeNodeInstance(ev.id);
    else if (ev.type === 'hit') {
      if (this.game.fog.isVisible(ev.x, ev.z)) {
        const y = this.game.heightAt(ev.x, ev.z) + (ev.kind === 'unit' ? 0.6 : 1.5);
        this.spawnBurst(ev.x, y, ev.z, 0xd8c8a0, ev.kind === 'unit' ? 3 : 4, 0.45); // turf puff
      }
    } else if (ev.type === 'death') {
      const u = ev.unit;
      if (this.game.fog.isVisible(u.x, u.z)) this.spawnBurst(u.x, this.game.heightAt(u.x, u.z) + 0.5, u.z, 0xd8c8a0, 6, 0.6); // jogs off in a puff of turf
    } else if (ev.type === 'destroyed') {
      const b = ev.building;
      this.spawnConfetti(b.x, this.game.heightAt(b.x, b.z) + 2, b.z, 40, 0.7);
    } else if (ev.type === 'gameover' && ev.result === 'win') {
      const b = this.game.buildings.find(x => x.owner === PLAYER && x.type === 'towncenter');
      if (b) this.spawnConfetti(b.x, this.game.heightAt(b.x, b.z) + 6, b.z, 120, 0.9);
    } else if (ev.type === 'newgame' || ev.type === 'loaded') {
      this.buildWorld();
    }
  }

  // ---------- selection rings ----------
  updateRings(selectedIds, hoverRef) {
    const g = this.game;
    let i = 0;
    const use = (x, z, r, mat) => {
      let ring = this.rings[i];
      if (!ring) { ring = new THREE.Mesh(G.ring, mat); ring.rotation.x = -Math.PI / 2; this.fxGroup.add(ring); this.rings.push(ring); }
      ring.material = mat;
      ring.visible = true;
      ring.position.set(x, g.heightAt(x, z) + 0.12, z);
      ring.scale.setScalar(r);
      i++;
    };
    for (const id of selectedIds) {
      const u = g.unit(id);
      if (u) { use(u.x, u.z, u.type === 'knight' ? 1.5 : 1.0, M.ring[u.owner]); continue; }
      const b = g.building(id);
      if (b) use(b.x, b.z, buildingHalf(b) * 1.25, M.ring[b.owner]);
    }
    if (hoverRef) {
      const e = g.getEntity(hoverRef);
      if (e && !selectedIds.includes(e.id)) {
        const r = hoverRef.kind === 'building' ? buildingHalf(e) * 1.25 : hoverRef.kind === 'node' ? 1.3 : 1.0;
        use(e.x, e.z, r, M.ringHover);
      }
    }
    for (; i < this.rings.length; i++) this.rings[i].visible = false;
  }

  // ---------- placement ghost ----------
  setGhost(type, owner) {
    this.clearGhost();
    if (!type) return;
    const grp = buildBuilding(type, owner);
    grp.userData.scaffold.visible = false;
    grp.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false;
        o.castShadow = false;
      }
    });
    const size = BUILDINGS[type].size * CELL;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(size + 0.4, size + 0.4), new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.35, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.15;
    grp.add(pad);
    grp.userData.pad = pad;
    this.scene.add(grp);
    this.ghost = grp;
  }
  updateGhost(x, z, ok) {
    if (!this.ghost) return;
    this.ghost.position.set(x, this.game.heightAt(x, z) + 0.05, z);
    this.ghost.userData.pad.material.color.setHex(ok ? 0x44ff66 : 0xff4444);
    this.ghost.traverse(o => { if (o.isMesh && o !== this.ghost.userData.pad && o.material.emissive) o.material.emissive.setHex(ok ? 0x001a05 : 0x330000); });
  }
  clearGhost() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
  }

  // ---------- camera ----------
  updateCamera() {
    const r = this.rig;
    r.x = Math.max(-HALF + 10, Math.min(HALF - 10, r.x));
    r.z = Math.max(-HALF + 10, Math.min(HALF - 10, r.z));
    const ty = this.game.heightAt(r.x, r.z);
    const cx = r.x - Math.sin(r.yaw) * Math.cos(r.pitch) * r.dist;
    const cz = r.z - Math.cos(r.yaw) * Math.cos(r.pitch) * r.dist;
    const cy = ty + Math.sin(r.pitch) * r.dist;
    this.camera.position.set(cx, Math.max(cy, this.game.heightAt(cx, cz) + 4), cz);
    this.camera.lookAt(r.x, ty, r.z);
    // shadow follows
    this.sun.position.copy(this.sunDir).multiplyScalar(160).add(new THREE.Vector3(r.x, 0, r.z));
    this.sun.target.position.set(r.x, ty, r.z);
    this.sun.target.updateMatrixWorld();
  }

  // Ground point under a normalized device coordinate, by marching the heightmap.
  groundPoint(nx, ny) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    let t = 0, prevT = 0;
    const g = this.game;
    let step = 2.5;
    for (let i = 0; i < 400; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > HALF + 60 || Math.abs(z) > HALF + 60) return null;
      const h = Math.max(WATER_LEVEL, g.heightAt(Math.max(-HALF, Math.min(HALF, x)), Math.max(-HALF, Math.min(HALF, z))));
      if (y < h) {
        // bisect
        let lo = prevT, hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          const mx = o.x + d.x * mid, my = o.y + d.y * mid, mz = o.z + d.z * mid;
          const mh = Math.max(WATER_LEVEL, g.heightAt(Math.max(-HALF, Math.min(HALF, mx)), Math.max(-HALF, Math.min(HALF, mz))));
          if (my < mh) hi = mid; else lo = mid;
        }
        const ft = (lo + hi) / 2;
        return { x: o.x + d.x * ft, z: o.z + d.z * ft };
      }
      prevT = t; t += step; step = Math.min(6, step * 1.03);
      if (t > 1500) break;
    }
    return null;
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, z: v.z };
  }

  render(dt) {
    this.time += dt;
    if (this.water) {
      this.water.material.uniforms.time.value = this.time;
      this.water.material.uniforms.camPos.value.copy(this.camera.position);
    }
    if (M.blade.userData.timeU) M.blade.userData.timeU.value = this.time;
    this.updateEffects(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
