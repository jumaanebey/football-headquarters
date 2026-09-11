import { COMBAT_RULES_VERSION } from '../game/combat/actions';
// Live two-account evidence for the club-authority service. Creates two clearly named
// anonymous test accounts against the configured Supabase project, drives them through the
// protected-club journey with the headless bot, and prints a report of accepted/rejected
// operations, retry/duplicate cases, a confirmed reward, a saved upgrade, a defense receipt
// and the matching film. Run: npm run authority:evidence (needs VITE_SUPABASE_URL/ANON_KEY).
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { validateReplay } from '../game/combat/replay';
import { replayMatch } from '../game/combat/engine';
import type { BattleConfig, BattleResult } from '../game/combat/contracts';
import { canonicalJson } from '../game/combat/canonical';

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
if (!URL_ || !ANON) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required');
const uuid = () => crypto.randomUUID();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const lines: string[] = [];
const log = (line: string) => { lines.push(line); console.log(line); };
const check = (ok: boolean, label: string) => { log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) process.exitCode = 1; };

interface Account { name: string; uid: string; token: string; revision: number }
const signup = async (name: string): Promise<Account> => {
  const res = await fetch(`${URL_}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`signup ${name}: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { name, uid: j.user.id, token: j.access_token, revision: 0 };
};
const call = async (a: Account, body: Record<string, unknown>): Promise<any> => {
  const res = await fetch(`${URL_}/functions/v1/club-authority`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (j?.club?.owner === a.uid && Number.isSafeInteger(j.club.revision)) a.revision = j.club.revision;
  return { status: res.status, ...j };
};
const op = (a: Account, kind: string, fields: Record<string, unknown>, operationId = uuid()) => ({ kind, operationId, expectedRevision: a.revision, ...fields });

let gamesReserved=0;
const playMatch = async (a: Account, choice: Record<string, unknown>, label: string) => {
  const reserved = await call(a, op(a, 'match.reserve', { choice: gamesReserved++===0 ? choice : {...choice,rules:gamesReserved===2?'defense-counters-4':COMBAT_RULES_VERSION} }));
  check(reserved.ok === true, `${a.name}: reserve ${label} (energy ${reserved.club?.state?.resources?.ENERGY})`);
  if (!reserved.ok) { log(`      ${reserved.code}: ${reserved.message}`); return null; }
  const matchId = reserved.result.matchId as string;
  const config = reserved.match.config as BattleConfig & { authority: { seed: number; rules: string } };
  check(config.authority.rules === (gamesReserved===1?'hero-actions-3':gamesReserved===2?'defense-counters-4':COMBAT_RULES_VERSION), `${a.name}: negotiated ${config.authority.rules}`);
  const begun = await call(a, op(a, 'match.begin', { matchId }));
  check(begun.ok === true, `${a.name}: begin ${label}`);
  const film = playHeadlessMatch(config, config.authority.seed, 'balanced', config.authority.rules===COMBAT_RULES_VERSION);
  if(config.authority.rules===COMBAT_RULES_VERSION)check(['focus','protect','push'].every(key=>film.submission.script.some(a=>a.k==='o'&&a.key===key)),`${a.name}: tactical orders recorded in ${label}`);
  const wait = film.submission.ticks * 50 + 1500 - (Date.now() - config.authority.issuedAt);
  if (wait > 0) await sleep(wait);
  const finishOp = op(a, 'match.finish', { matchId, submission: film.submission });
  const before = reserved.club.state.resources.COINS as number;
  const settled = await call(a, finishOp);
  check(settled.ok === true, `${a.name}: finish ${label} → stars ${settled.result?.battleResult?.stars}, +${settled.result?.battleResult?.coins} coins (client sim: ${film.result.stars} stars, +${film.result.coins})`);
  if (!settled.ok) { log(`      ${settled.code}: ${settled.message}`); return null; }
  check(settled.club.state.resources.COINS === before + settled.result.battleResult.coins, `${a.name}: coins credited exactly once (${before} → ${settled.club.state.resources.COINS})`);
  return { matchId, config, film, settled, finishOp };
};

const main = async () => {
  log(`# club-authority live evidence — ${new Date().toISOString()} — ${URL_}`);
  const A = await signup('A'), B = await signup('B');
  log(`accounts: A=${A.uid} B=${B.uid} (anonymous test accounts)`);
  for (const a of [A, B]) {
    const boot = await call(a, { kind: 'bootstrap' });
    check(boot.ok === true && boot.club?.origin === 'new' && boot.club.revision === 0, `${a.name}: bootstrap fresh protected club (origin ${boot.club?.origin})`);
    const renamed = await call(a, op(a, 'action', { action: { type: 'club.rename', name: `fhq-authority-evidence-${a.name}` } }));
    check(renamed.ok === true && renamed.club.state.teamName === `fhq-authority-evidence-${a.name}`, `${a.name}: club.rename confirmed (revision ${renamed.club?.revision})`);
  }
  // Rejections and retries on A.
  const stale = await call(A, { kind: 'action', operationId: uuid(), expectedRevision: 0, action: { type: 'rally' } });
  check(stale.ok === false && stale.code === 'revision_conflict', `A: stale expectedRevision → ${stale.code}`);
  const bad = await call(A, op(A, 'action', { action: { type: 'hero.spawn' } }));
  check(bad.ok === false && bad.code === 'invalid_command', `A: unknown action → ${bad.code}`);
  const poor = await call(A, op(A, 'action', { action: { type: 'builder.hire' } }));
  check(poor.ok === false && poor.code === 'insufficient_resources', `A: unaffordable purchase → ${poor.code}`);
  const gateOp = op(A, 'action', { action: { type: 'gate.assign', postId: 'south', heroKey: 'kicker' } }); // a starter hero every fresh club owns
  const gate1 = await call(A, gateOp);
  const gate2 = await call(A, gateOp); // lost-reply retry: identical request
  check(gate1.ok === true && gate2.ok === true && gate2.club.revision === gate1.club.revision && canonicalJson(gate2.result) === canonicalJson(gate1.result), `A: gate.assign confirmed once; verbatim retry returns the same receipt at revision ${gate1.club?.revision}`);
  const reuse = await call(A, { ...gateOp, action: { type: 'rally' } });
  check(reuse.ok === false && reuse.code === 'operation_conflict', `A: operation id reused for a different request → ${reuse.code}`);
  const early = await call(A, op(A, 'match.reserve', { choice: { kind: 'rival', target: B.uid } }));
  check(early.ok === false && early.code === 'beginner_protection', `A: rival before two Season games → ${early.code}`);

  // Both graduate through Season games; A collects enough for a Stadium upgrade.
  for (const a of [A, B]) for (let stage = 1; stage <= 3; stage++) {
    const played = await playMatch(a, { kind: 'campaign', stage }, `campaign stage ${stage}`);
    if (!played) throw new Error('campaign play failed');
    if (a === A && stage === 1) {
      const again = await call(A, played.finishOp);
      check(again.ok === true && canonicalJson(again.result) === canonicalJson(played.settled.result) && again.club.state.resources.COINS === played.settled.club.state.resources.COINS, 'A: duplicate match.finish returns the receipt without a second credit');
      const forged = await call(A, op(A, 'match.finish', { matchId: played.matchId, submission: { ...played.film.submission, finalHash: '00000000' } }));
      check(forged.ok === false, `A: settled match cannot be finished again → ${forged.code}`);
    }
  }
  // Tampered film on a fresh reservation.
  {
    const reserved = await call(A, op(A, 'match.reserve', { choice: { kind: 'road', choice: 0 } }));
    const matchId = reserved.result.matchId as string; const config = reserved.match.config as BattleConfig & { authority: { seed: number; issuedAt: number } };
    await call(A, op(A, 'match.begin', { matchId }));
    const film = playHeadlessMatch(config, config.authority.seed);
    const wait = film.submission.ticks * 50 + 1500 - (Date.now() - config.authority.issuedAt); if (wait > 0) await sleep(wait);
    const forged = await call(A, op(A, 'match.finish', { matchId, submission: { ...film.submission, finalHash: '00000000' } }));
    check(forged.ok === false && forged.code === 'simulation_mismatch', `A: forged finalHash → ${forged.code}`);
    const cancelled = await call(A, op(A, 'match.cancel', { matchId }));
    check(cancelled.ok === true && cancelled.result.refunded === false, `A: cancel a started game → released, refunded=${cancelled.result?.refunded}`);
  }
  // A's saved upgrade: Stadium L1→L2 (server timer), then settle it.
  const st = await call(A, { kind: 'status' });
  const stadium = st.club.state.buildings.find((b: any) => b.type === 'STADIUM');
  const up = await call(A, op(A, 'action', { action: { type: 'facility.upgrade', buildingId: stadium.id } }));
  check(up.ok === true, `A: facility.upgrade Stadium → job ${up.result?.jobId} to L${up.result?.toLevel} (spent ${up.result?.spent?.COINS} coins; coins now ${up.club?.state?.resources?.COINS})`);
  if (up.ok) {
    const job = up.club.state.upgrades.find((j: any) => j.id === up.result.jobId);
    await sleep(Math.max(0, job.finishTime - Date.now() + 1500));
    const synced = await call(A, op(A, 'action', { action: { type: 'sync' } }));
    check(synced.ok === true && synced.club.state.buildings.find((b: any) => b.id === stadium.id).level === 2, `A: upgrade settled by the server (Stadium L${synced.club?.state?.buildings?.find((b: any) => b.id === stadium.id)?.level})`);
  }
  const formation = await call(A, op(A, 'action', { action: { type: 'formation.set', formation: 'cover3' } }));
  check(formation.ok === true && formation.club.state.formation === 'cover3', 'A: formation.set cover3 confirmed');
  const shielded = await call(A, { kind: 'status' });
  log(`A after upgrades: revision ${A.revision}, trophies ${shielded.club.state.trophies}, heroGates ${JSON.stringify(shielded.club.state.heroGates)}, formation ${shielded.club.state.formation}`);

  // B raids A: the server builds A's defense snapshot from A's current state.
  const status = await call(B, { kind: 'status' });
  check(Array.isArray(status.rivals) && status.rivals.some((r: any) => r.owner === A.uid), `B: A listed as a protected rival (${status.rivals?.length} rivals)`);
  const aBefore = (await call(A, { kind: 'status' })).club;
  const raid = await playMatch(B, { kind: 'rival', target: A.uid }, 'rival raid on A');
  if (!raid) throw new Error('rival raid failed');
  const cfg = raid.config as BattleConfig;
  check(cfg.defenseFormation === 'cover3' && !!cfg.defenseSnapshotId && !!cfg.defenseLayoutId, `B: attacked snapshot formation=${cfg.defenseFormation} snapshot=${cfg.defenseSnapshotId} layout=${cfg.defenseLayoutId}`);
  check((cfg.homeGuards ?? []).some(g => g.name === 'The Specialist'), `B: attacked snapshot carries A's assigned south-gate hero (The Specialist) (${(cfg.homeGuards ?? []).filter(g => g.jersey === 0).map(g => g.name).join(', ')})`);
  const hq = cfg.buildings.find(b => b.kind === 'hq');
  check(!!hq && hq.hp >= 675, `B: attacked Stadium reflects the saved upgrade (HQ hp ${hq?.hp})`);
  const battle = raid.settled.result.battleResult as BattleResult;
  const aAfter = (await call(A, { kind: 'status' })).club;
  const receipt = aAfter.state.defenseLog[0];
  check(receipt?.authorityMatchId === raid.matchId && receipt.attackerPid === B.uid && receipt.stars === battle.stars && receipt.pct === battle.pct, `A: defense receipt ${JSON.stringify({ stars: receipt?.stars, pct: receipt?.pct, coinsLost: receipt?.coinsLost, authorityMatchId: receipt?.authorityMatchId })}`);
  check(aAfter.revision === aBefore.revision + 2, `A: revision advanced by reserve+settle (${aBefore.revision} → ${aAfter.revision})`);
  check(aAfter.state.resources.COINS === aBefore.state.resources.COINS - receipt.coinsLost, `A: coins ${aBefore.state.resources.COINS} → ${aAfter.state.resources.COINS} (lost ${receipt.coinsLost})`);
  const again = await call(B, raid.finishOp);
  const aRetry = (await call(A, { kind: 'status' })).club;
  check(again.ok === true && aRetry.revision === aAfter.revision && aRetry.state.defenseLog.length === 1, 'B: duplicate settlement leaves A untouched (one receipt)');
  const filmA = await call(A, { kind: 'film', matchId: raid.matchId });
  const filmB = await call(B, { kind: 'film', matchId: raid.matchId });
  check(filmA.ok === true && filmB.ok === true && canonicalJson(filmA.result) === canonicalJson(filmB.result), 'both accounts fetch the identical film');
  const replay = validateReplay(filmA.result?.replay);
  const verified = replay ? replayMatch(replay) : null;
  check(!!replay && replay.snapshot?.defenseSnapshotId === cfg.defenseSnapshotId && !!verified?.matches && verified.result?.pct === battle.pct && verified.result?.stars === battle.stars, `A's film replays to the settled result under the attacked snapshot (pct ${verified?.result?.pct}, hash ${verified?.hash})`);
  const C = await signup('C'); await call(C, { kind: 'bootstrap' });
  const filmC = await call(C, { kind: 'film', matchId: raid.matchId });
  check(filmC.ok === false && filmC.code === 'film_unavailable', `C: third account cannot fetch the film → ${filmC.code}`);
  const shield = await call(B, op(B, 'match.reserve', { choice: { kind: 'rival', target: A.uid } }));
  check(shield.ok === false && (shield.code === 'shielded' || shield.code === 'target_busy' || shield.code === 'beginner_protection'), `B: raiding A again right after → ${shield.code} (${shield.message})`);
  log(`\nsummary: ${lines.filter(l => l.startsWith('PASS')).length} passed, ${lines.filter(l => l.startsWith('FAIL')).length} failed; accounts A=${A.uid} B=${B.uid} C=${C.uid}`);
};
main().catch(error => { console.error(error); process.exitCode = 1; });
