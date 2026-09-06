// Fog of war: explored / visible grid for the human player plus a shader hook.
import * as THREE from 'three';
import { MAP_SIZE, FOG_CELL, FOG_GRID } from './config.js';

const HALF = MAP_SIZE / 2;

export class FogOfWar {
  constructor() {
    this.explored = new Uint8Array(FOG_GRID * FOG_GRID);
    this.visible = new Uint8Array(FOG_GRID * FOG_GRID);
    this.data = new Uint8Array(FOG_GRID * FOG_GRID);
    this.texture = new THREE.DataTexture(this.data, FOG_GRID, FOG_GRID, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
    this.uniforms = { fowMap: { value: this.texture }, fowSize: { value: MAP_SIZE }, fowEnabled: { value: 1.0 } };
    this.revealAll = false;
  }

  cellOf(x, z) {
    return {
      cx: Math.max(0, Math.min(FOG_GRID - 1, Math.floor((x + HALF) / FOG_CELL))),
      cz: Math.max(0, Math.min(FOG_GRID - 1, Math.floor((z + HALF) / FOG_CELL))),
    };
  }
  isVisible(x, z) {
    if (this.revealAll) return true;
    const { cx, cz } = this.cellOf(x, z);
    return this.visible[cz * FOG_GRID + cx] === 1;
  }
  isExplored(x, z) {
    if (this.revealAll) return true;
    const { cx, cz } = this.cellOf(x, z);
    return this.explored[cz * FOG_GRID + cx] === 1;
  }

  // sources: [{x, z, r}]
  update(sources) {
    this.visible.fill(0);
    for (const s of sources) {
      const r = s.r / FOG_CELL;
      const { cx, cz } = this.cellOf(s.x, s.z);
      const ri = Math.ceil(r);
      for (let dz = -ri; dz <= ri; dz++) {
        const z = cz + dz; if (z < 0 || z >= FOG_GRID) continue;
        for (let dx = -ri; dx <= ri; dx++) {
          const x = cx + dx; if (x < 0 || x >= FOG_GRID) continue;
          if (dx * dx + dz * dz <= r * r) {
            const i = z * FOG_GRID + x;
            this.visible[i] = 1; this.explored[i] = 1;
          }
        }
      }
    }
    this.refreshTexture();
  }

  refreshTexture() {
    const d = this.data;
    for (let i = 0; i < d.length; i++) {
      d[i] = this.revealAll ? 255 : this.visible[i] ? 255 : this.explored[i] ? 110 : 0;
    }
    this.texture.needsUpdate = true;
  }

  serialize() { return Array.from(this.explored); }
  load(arr) {
    if (arr && arr.length === this.explored.length) this.explored.set(arr);
    this.refreshTexture();
  }

  // Inject fog-of-war darkening into any built-in three.js material.
  apply(material) {
    const uniforms = this.uniforms;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.fowMap = uniforms.fowMap;
      shader.uniforms.fowSize = uniforms.fowSize;
      shader.uniforms.fowEnabled = uniforms.fowEnabled;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFowWorld;')
        .replace('#include <project_vertex>', `
          vec4 fowPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          fowPos = instanceMatrix * fowPos;
          #endif
          vFowWorld = (modelMatrix * fowPos).xyz;
          #include <project_vertex>`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFowWorld;\nuniform sampler2D fowMap;\nuniform float fowSize;\nuniform float fowEnabled;')
        .replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          {
            float fow = texture2D(fowMap, vFowWorld.xz / fowSize + 0.5).r;
            fow = mix(1.0, fow, fowEnabled);
            float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
            vec3 desat = mix(vec3(lum), gl_FragColor.rgb, 0.55) * vec3(0.75, 0.8, 0.95);
            gl_FragColor.rgb = mix(desat, gl_FragColor.rgb, smoothstep(0.42, 1.0, fow)) * smoothstep(-0.05, 0.45, fow);
          }`);
    };
    material.customProgramCacheKey = () => 'fow';
    return material;
  }
}
