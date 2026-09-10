// Deployment/source parity guard for the club-authority Edge Function. Compares four things that
// can drift apart: the authoritative TypeScript sources, the generated readable bundle, the
// commit-pinned minified deploy artifacts, and the recorded deployment (supabase/recovery/
// deployed.json). Pure functions over file contents so the guard can be exercised against a
// stale fixture in a temporary directory (tests/authorityParity.test.ts); scripts/build-authority.mjs
// --check wires it to the real tree. Nothing here reads environment variables or tokens, and the
// generated outputs are scanned for token-shaped strings so a secret can never ship inside a bundle.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile);
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
/** JWT-like or Supabase-style secrets: three base64url segments starting with eyJ, or sb_secret_/service_role key literals. */
const SECRET_SHAPES = [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /sb_secret_[A-Za-z0-9_-]{8,}/, /sbp_[a-f0-9]{20,}/];
export const findSecretShapes = (text) => SECRET_SHAPES.filter(re => re.test(text)).map(re => re.source.slice(0, 12));

const readText = (path) => readFile(path, 'utf8').catch(() => null);
const rulesFrom = (source) => source?.match(/export const COMBAT_RULES_VERSION\s*=\s*'([^']+)'/)?.[1] ?? null;
const artifactAtCommit = async (root, commit, path) => {
  try { const { stdout } = await run('git', ['-C', root, 'show', `${commit}:${path}`], { maxBuffer: 64 * 1024 * 1024 }); return stdout; } catch { return null; }
};

/**
 * @param {{ root: string, readable: string, minified: string, requireDeployedCurrent?: boolean, git?: boolean }} input
 *   readable/minified: freshly built bundle texts (readable = what index.ts must equal; minified = what the staged artifact must equal).
 * @returns {Promise<{ ok: boolean, lines: Array<{ level: 'pass'|'fail'|'info', text: string }>, deployment: 'current'|'lagging'|'unknown' }>}
 */
export async function checkAuthorityParity({ root, readable, minified, requireDeployedCurrent = false, git = true }) {
  const lines = [];
  const pass = (text) => lines.push({ level: 'pass', text });
  const fail = (text) => lines.push({ level: 'fail', text });
  const info = (text) => lines.push({ level: 'info', text });
  const at = (p) => resolve(root, p);

  // 1. Source → readable bundle.
  const index = await readText(at('supabase/functions/club-authority/index.ts'));
  if (index === readable) pass(`generated index.ts matches the sources (sha256 ${sha256(readable).slice(0, 12)}…)`);
  else fail(`supabase/functions/club-authority/index.ts is stale (expected sha256 ${sha256(readable).slice(0, 12)}…); run npm run authority:build`);

  // 2. Secrets in generated output.
  for (const [name, text] of [['readable bundle', readable], ['minified bundle', minified]]) {
    const hits = findSecretShapes(text);
    if (hits.length) fail(`${name} contains a token-shaped string (${hits.join(', ')}); never commit or deploy it`); else pass(`${name} carries no token-shaped strings`);
  }

  // 3. Deployment record.
  const recordText = await readText(at('supabase/recovery/deployed.json'));
  let record = null;
  try { record = recordText ? JSON.parse(recordText) : null; } catch { record = null; }
  if (!record?.deployed?.artifact || !record?.deployed?.sha256 || !record?.deployed?.commit || !record?.deployed?.rules || !record?.staged?.artifact || !record?.staged?.sha256 || !record?.staged?.rules) {
    fail('supabase/recovery/deployed.json is missing or incomplete (deployed/staged artifact, sha256, commit, rules)');
    return { ok: false, lines, deployment: 'unknown' };
  }
  const sourceRules = rulesFrom(await readText(at('game/combat/actions.ts')));
  if (!sourceRules) fail('could not read COMBAT_RULES_VERSION from game/combat/actions.ts'); else pass(`source rules ${sourceRules}`);

  // 4. Staged artifact == fresh minified build == recorded sha.
  const stagedText = await readText(at(record.staged.artifact));
  const minifiedSha = sha256(minified);
  if (stagedText === null) fail(`staged artifact ${record.staged.artifact} is missing`);
  else {
    const stagedSha = sha256(stagedText);
    if (stagedSha !== record.staged.sha256) fail(`staged artifact ${record.staged.artifact} sha256 ${stagedSha.slice(0, 12)}… differs from the recorded ${record.staged.sha256.slice(0, 12)}…`);
    else if (stagedSha !== minifiedSha) fail(`staged artifact ${record.staged.artifact} no longer matches the sources (fresh minified sha256 ${minifiedSha.slice(0, 12)}…); build the next artifact and record it`);
    else pass(`staged ${record.staged.artifact} equals the fresh minified build (sha256 ${stagedSha.slice(0, 12)}…)`);
  }
  if (sourceRules && record.staged.rules !== sourceRules) fail(`staged record says rules ${record.staged.rules} but the sources are ${sourceRules}`);

  // 5. Deployed artifact: file, pinned commit and record agree.
  const deployedText = await readText(at(record.deployed.artifact));
  if (deployedText === null) fail(`deployed artifact ${record.deployed.artifact} is missing from the tree`);
  else if (sha256(deployedText) !== record.deployed.sha256) fail(`deployed artifact ${record.deployed.artifact} was modified in the tree (sha256 ${sha256(deployedText).slice(0, 12)}… vs recorded ${record.deployed.sha256.slice(0, 12)}…)`);
  else pass(`deployed artifact ${record.deployed.artifact} matches its record (sha256 ${record.deployed.sha256.slice(0, 12)}…)`);
  if (git) {
    const pinned = await artifactAtCommit(root, record.deployed.commit, record.deployed.artifact);
    if (pinned === null) fail(`pinned commit ${record.deployed.commit.slice(0, 7)} does not contain ${record.deployed.artifact} (or is not in this repository)`);
    else if (sha256(pinned) !== record.deployed.sha256) fail(`artifact at pinned commit ${record.deployed.commit.slice(0, 7)} has sha256 ${sha256(pinned).slice(0, 12)}…, not the recorded ${record.deployed.sha256.slice(0, 12)}…`);
    else pass(`pinned commit ${record.deployed.commit.slice(0, 7)} serves the recorded artifact`);
  }
  if (record.deployed.entryMode === 'inline-artifact') {
    if (record.deployed.entrySha256 !== record.deployed.sha256) fail('inline deployment entry hash does not match the pinned artifact');
    else pass(`inline deployment entry matches artifact pinned at ${record.deployed.commit.slice(0, 7)}`);
  } else {
  const entry = (record.entryTemplate ?? '').replace('{repository}', record.repository ?? '').replace('{commit}', record.deployed.commit).replace('{artifact}', record.deployed.artifact);
  if (!/^import 'https:\/\/cdn\.jsdelivr\.net\/gh\/[^/]+\/[^@]+@[0-9a-f]{7,40}\/supabase\/recovery\/club-authority\.v\d+\.min\.js';$/.test(entry)) fail(`deployment entry is not a commit-pinned jsDelivr import: ${entry}`);
  else pass(`deployment entry pins ${record.deployed.commit.slice(0, 7)}`);
  }

  // 6. Rules drift between the deployed function and the sources: a client built from these sources would be refused by the deployed server.
  if (sourceRules && record.deployed.rules !== sourceRules) fail(`RULES DRIFT: deployed v${record.deployed.version} runs ${record.deployed.rules}, sources are ${sourceRules}; deploy before shipping a client from these sources`);
  else if (sourceRules) pass(`deployed v${record.deployed.version} and the sources agree on rules ${sourceRules}`);

  // 7. Deployment lag (informational unless required).
  let deployment = 'unknown';
  if (deployedText !== null) {
    deployment = sha256(deployedText) === minifiedSha ? 'current' : 'lagging';
    if (deployment === 'current') pass(`deployed v${record.deployed.version} equals the sources`);
    else (requireDeployedCurrent ? fail : info)(`deployment lags the sources: v${record.deployed.version} deployed, v${record.staged.version} staged (sha256 ${record.staged.sha256.slice(0, 12)}…) awaiting owner-authorized deployment`);
  }
  return { ok: !lines.some(l => l.level === 'fail'), lines, deployment };
}
