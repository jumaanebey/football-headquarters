// Item 20: the parity guard detects drift among sources, generated bundle, pinned artifacts and
// the deployment record. Exercised against a temporary git repository with intentionally stale
// or tampered fixtures; never against production.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkAuthorityParity, sha256, findSecretShapes } from '../scripts/authority-parity.mjs';

const READABLE = '// GENERATED\nexport const rules = "hero-actions-3";\n';
const V3 = 'v3-minified-deployed-artifact';
const V4 = 'v4-minified-staged-artifact';
let root = '';
let commit = '';
const write = async (rel: string, text: string) => { await mkdir(join(root, rel, '..'), { recursive: true }); await writeFile(join(root, rel), text); };
const record = (overrides: Record<string, unknown> = {}, deployed: Record<string, unknown> = {}, staged: Record<string, unknown> = {}) => JSON.stringify({
  function: 'club-authority', repository: 'example/repo', entryTemplate: "import 'https://cdn.jsdelivr.net/gh/{repository}@{commit}/{artifact}';",
  deployed: { version: 3, artifact: 'supabase/recovery/club-authority.v3.min.js', sha256: sha256(V3), commit, rules: 'hero-actions-3', ...deployed },
  staged: { version: 4, artifact: 'supabase/recovery/club-authority.v4.min.js', sha256: sha256(V4), rules: 'hero-actions-3', ...staged },
  ...overrides,
});
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } }).trim();
const fails = (r: Awaited<ReturnType<typeof checkAuthorityParity>>) => r.lines.filter(l => l.level === 'fail').map(l => l.text);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'fhq-parity-'));
  await write('game/combat/actions.ts', "export const COMBAT_RULES_VERSION = 'hero-actions-3';\n");
  await write('supabase/functions/club-authority/index.ts', READABLE);
  await write('supabase/recovery/club-authority.v3.min.js', V3);
  await write('supabase/recovery/club-authority.v4.min.js', V4);
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'fixture');
  commit = git('rev-parse', 'HEAD');
  await write('supabase/recovery/deployed.json', record());
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe('authority parity guard', () => {
  it('passes on a consistent tree and reports a lagging deployment as information', async () => {
    const r = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(fails(r)).toEqual([]);
    expect(r.ok).toBe(true); expect(r.deployment).toBe('lagging');
    expect(r.lines.some(l => l.level === 'info' && l.text.includes('v3 deployed, v4 staged'))).toBe(true);
    const strict = await checkAuthorityParity({ root, readable: READABLE, minified: V4, requireDeployedCurrent: true });
    expect(strict.ok).toBe(false); expect(fails(strict)).toEqual([expect.stringContaining('deployment lags the sources')]);
    const current = await checkAuthorityParity({ root, readable: READABLE, minified: V3 });
    expect(current.deployment).toBe('current');
  });
  it('fails when the staged artifact no longer matches the sources (stale artifact)', async () => {
    const r = await checkAuthorityParity({ root, readable: READABLE, minified: 'v5-sources-changed-since-v4' });
    expect(r.ok).toBe(false);
    expect(fails(r)).toEqual([expect.stringContaining('no longer matches the sources')]);
  });
  it('fails when the generated index.ts is stale', async () => {
    const r = await checkAuthorityParity({ root, readable: READABLE + '// newer\n', minified: V4 });
    expect(fails(r)).toEqual([expect.stringContaining('index.ts is stale')]);
  });
  it('fails when a preserved artifact is edited in the tree or its record disagrees with the pinned commit', async () => {
    const original = await readFile(join(root, 'supabase/recovery/club-authority.v3.min.js'), 'utf8');
    await write('supabase/recovery/club-authority.v3.min.js', V3 + ' tampered');
    const tampered = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(fails(tampered)).toEqual([expect.stringContaining('was modified in the tree')]);
    await write('supabase/recovery/club-authority.v3.min.js', original);
    // Record claims a different hash than what the pinned commit really serves.
    await write('supabase/recovery/deployed.json', record({}, { sha256: sha256('something else') }));
    const wrongRecord = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(fails(wrongRecord)).toEqual([expect.stringContaining('was modified in the tree'), expect.stringContaining('not the recorded')]);
    await write('supabase/recovery/deployed.json', record({}, { commit: '0000000000000000000000000000000000000000' }));
    const missingCommit = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(fails(missingCommit)).toEqual([expect.stringContaining('does not contain')]);
    await write('supabase/recovery/deployed.json', record());
  });
  it('fails on rules drift between the deployed function and the sources, and on an incomplete or unpinned record', async () => {
    await write('supabase/recovery/deployed.json', record({}, { rules: 'hero-actions-2' }));
    const drift = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(fails(drift)).toEqual([expect.stringContaining('RULES DRIFT')]);
    await write('supabase/recovery/deployed.json', record({ entryTemplate: "import 'https://example.invalid/latest.js';" }));
    const unpinned = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(fails(unpinned)).toEqual([expect.stringContaining('not a commit-pinned')]);
    await write('supabase/recovery/deployed.json', '{"deployed":{}}');
    const incomplete = await checkAuthorityParity({ root, readable: READABLE, minified: V4 });
    expect(incomplete.ok).toBe(false); expect(incomplete.deployment).toBe('unknown');
    await write('supabase/recovery/deployed.json', record());
  });
  it('refuses generated output that carries a token-shaped string', async () => {
    const leaked = READABLE + 'const k = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnopqrstuvwxyz";\n';
    expect(findSecretShapes(leaked)).toHaveLength(1);
    expect(findSecretShapes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")')).toEqual([]); // the env *name* is fine
    const r = await checkAuthorityParity({ root, readable: leaked, minified: V4 });
    expect(fails(r)).toEqual([expect.stringContaining('index.ts is stale'), expect.stringContaining('token-shaped')]);
  });
});
