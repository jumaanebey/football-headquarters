// Vite plugin: bundle pwa/sw.ts into dist/sw.js after the build, precaching the shell (HTML,
// the fingerprinted bundle files, manifest, icons, logo). The worker version is the hash of that
// list. FHQ_SW_KILLSWITCH=1 ships pwa/sw-killswitch.js instead (see docs).
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import type { Plugin } from 'vite';

export const SHELL_STATIC = ['/', '/manifest.webmanifest', '/assets/brand/icon-192.png', '/assets/brand/icon-512.png', '/assets/brand/logo.webp'];

export function serviceWorker(): Plugin {
  let root = process.cwd(), outDir = 'dist', building = false;
  const bundleFiles: string[] = [];
  return {
    name: 'fhq-service-worker',
    configResolved(config) { root = config.root; outDir = config.build.outDir; building = config.command === 'build'; },
    generateBundle(_options, bundle) { for (const file of Object.keys(bundle)) if (/^assets\/index-.*\.(js|css)$/.test(file)) bundleFiles.push('/' + file); },
    async closeBundle() {
      if (!building) return;
      const target = join(root, outDir, 'sw.js');
      if (process.env.FHQ_SW_KILLSWITCH === '1') { await fs.copyFile(join(root, 'pwa/sw-killswitch.js'), target); console.log('fhq-service-worker: KILL SWITCH worker written to dist/sw.js'); return; }
      const precache = [...SHELL_STATIC, ...bundleFiles.sort()];
      const version = createHash('sha256').update(JSON.stringify(precache)).digest('hex').slice(0, 12);
      const result = await esbuild({ entryPoints: [join(root, 'pwa/sw.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true, define: { __SW_VERSION__: JSON.stringify(version), __PRECACHE__: JSON.stringify(precache) }, logLevel: 'warning' });
      await fs.writeFile(target, `// Football Headquarters service worker ${version}\n` + result.outputFiles[0].text);
      await fs.writeFile(join(root, outDir, 'sw-version.json'), JSON.stringify({ version, precache }));
      console.log(`fhq-service-worker: dist/sw.js version ${version} precaching ${precache.length} shell files`);
    },
  };
}
