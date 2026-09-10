// Runs the fixed match corpus inside a real Chrome runtime and compares its gameplay hashes with
// the Node runtime and the committed corpus. Usage: node scripts/determinism-browser.mjs
// (uses the installed Chrome through Playwright; no network, no accounts, nothing written).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'scripts/determinism-corpus-entry.ts');
const expected = JSON.parse(await readFile(resolve(root, 'tests/fixtures/determinism-corpus.json'), 'utf8'));

const nodeBundle = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node20', define: { 'import.meta.env': '{}' }, logLevel: 'warning' });
await mkdir(resolve(root, 'dist'), { recursive: true });
const nodeFile = resolve(root, 'dist/determinism-corpus.node.mjs');
await writeFile(nodeFile, nodeBundle.outputFiles[0].text);
const { runCorpusForRuntime } = await import(nodeFile);
const nodeOutcomes = runCorpusForRuntime();

const browserBundle = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: 'FHQCorpus', platform: 'browser', target: 'es2020', define: { 'import.meta.env': '{}' }, logLevel: 'warning' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent('<!doctype html><title>corpus</title>');
await page.addScriptTag({ content: browserBundle.outputFiles[0].text });
const browserOutcomes = await page.evaluate(() => globalThis.FHQCorpus.runCorpusForRuntime());
const ua = await page.evaluate(() => navigator.userAgent);
await browser.close();

let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };
line(expected.rules === nodeOutcomes.rules && nodeOutcomes.rules === browserOutcomes.rules, `rules ${nodeOutcomes.rules} on node and Chrome`);
for (const id of Object.keys(expected.matches)) {
  const e = expected.matches[id], n = nodeOutcomes.matches[id], b = browserOutcomes.matches[id];
  line(n && b && n.hash === e.hash && b.hash === e.hash && n.replayHash === e.hash && b.replayHash === e.hash && n.stars === e.stars && b.stars === e.stars && n.pct === e.pct && b.pct === e.pct && n.ticks === e.ticks && b.ticks === e.ticks,
    `${id}: node ${n?.hash}/${n?.replayHash} · Chrome ${b?.hash}/${b?.replayHash} · expected ${e.hash} (${e.stars}★ ${e.pct}% ${e.ticks} ticks)`);
}
console.log(`runtimes exercised: node ${process.version}; ${ua}`);
console.log(failures ? `RESULT: ${failures} mismatch(es)` : 'RESULT: node and Chrome agree with the committed corpus');
process.exitCode = failures ? 1 : 0;
