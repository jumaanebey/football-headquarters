import { describe, expect, it } from 'vitest';
import { RECRUIT_CONFIG } from '../constants';
import { candidateOvr, recruitCost, recruitSeconds, rosterCap } from '../recruiting';
import { applyClubAction } from '../game/authority/clubActions';
import { prospectComparison, scoutingBoard } from '../game/progression';
import { PlayerRole } from '../types';
import { NOW, act, baseState, context, fullRosterState, prospectAt, scoutingBoardState, scoutingJobState, tiedRosterState } from './fixtures/progression';

describe('scouting board model', () => {
  it('preserves server-issued prospect ids and prices them with the authority\'s helpers', () => {
    const s = scoutingBoardState();
    const board = scoutingBoard(s, NOW);
    expect(board.board).toMatchObject({ kind: 'issued', generatedAt: s.recruitBoard!.generatedAt, stale: false, staleReasons: [] });
    expect(board.prospects.map(p => p.prospectId)).toEqual(s.recruitBoard!.candidates.map(c => c.id));
    expect(board.prospects).toHaveLength(RECRUIT_CONFIG.candidateCount);
    for (const p of board.prospects) {
      const c = s.recruitBoard!.candidates.find(x => x.id === p.prospectId)!;
      expect(p.costCoins).toBe(recruitCost(c));
      expect(p.scoutSeconds).toBe(recruitSeconds(c));
      expect(p.ovr).toBe(candidateOvr(c));
      expect(p.canScout).toBe(true);
    }
    const receipt = act(s, { type: 'recruit.start', candidateId: board.prospects[0].prospectId }).result;
    expect(receipt).toMatchObject({ playerId: board.prospects[0].prospectId, spent: { COINS: board.prospects[0].costCoins } });
    expect(board.roster).toEqual({ cap: rosterCap(1), size: 10, full: false, remaining: 2, cutFloor: 6, canCut: true });
  });

  it('compares against the strongest current player at the role, reporting ties and empty positions', () => {
    const s = prospectAt(scoutingBoardState(), PlayerRole.OL);
    const p = prospectComparison(s, 'srv_prospect_1')!;
    const ols = s.roster.filter(x => x.role === PlayerRole.OL);
    const best = ols.reduce((a, b) => (candidateOvr(b) > candidateOvr(a) ? b : a));
    expect(p.depth).toEqual({ atRole: 3, inUnit: 3, firstAtRole: false });
    expect(p.comparable?.id).toBe(best.id);
    expect(p.statDiff).toEqual({ strength: 20 - best.stats.strength, speed: 18 - best.stats.speed, iq: 16 - best.stats.iq, ovr: p.ovr - candidateOvr(best), power: p.power - p.comparable!.power });
    expect(p.trainingImplications).toMatchObject({ perDrillCollect: { level: 1 }, drillIds: ['sled_push', 'scrimmage'], replacesComparable: false });
    // Ties: two OLs with identical stats — the first in roster order is named, both are listed.
    const tied = prospectComparison(prospectAt(tiedRosterState(), PlayerRole.OL), 'srv_prospect_1')!;
    expect(tied.comparable?.tie).toBe(true);
    expect(tied.comparable?.tiedIds).toEqual(expect.arrayContaining(['ol1', 'ol_twin']));
    expect(tied.comparable?.id).toBe('ol1');
    expect(new Set(tied.comparable?.tiedIds).size).toBe(tied.comparable?.tiedIds.length);
    // Empty position: nobody at the role; the unit fallback still gives a reference point.
    const emptyRole = { ...s, roster: s.roster.filter(x => x.role !== PlayerRole.OL) };
    const first = prospectComparison(emptyRole, 'srv_prospect_1')!;
    expect(first.depth.firstAtRole).toBe(true);
    expect(first.comparable).toBeNull();
    expect(first.statDiff).toBeNull();
    expect(first.comparableInUnit).toBeNull(); // OL is the only role in its unit
    expect(scoutingBoard(emptyRole, NOW).emptyRoles).toEqual([PlayerRole.OL]);
  });

  it('a full roster, an active job and an unaffordable price block scouting with the authority\'s reasons', () => {
    const full = scoutingBoard(fullRosterState(), NOW);
    expect(full.roster.full).toBe(true);
    for (const p of full.prospects) expect(p.blockers).toEqual([{ code: 'limit_reached', message: 'Your roster is full.' }]);
    expect(applyClubAction(fullRosterState(), { type: 'recruit.start', candidateId: full.prospects[0].prospectId }, context())).toMatchObject({ ok: false, code: 'limit_reached' });
    const { state: busy, candidateId } = scoutingJobState();
    const b = scoutingBoard(busy, NOW);
    expect(b.job).toMatchObject({ candidateId, ready: false, costCoins: busy.recruitSlot!.cost });
    expect(b.job?.rush).toMatchObject({ gemCost: RECRUIT_CONFIG.rushGemCost, canRush: true }); // 10 starting Crowns ≥ 5
    expect(scoutingBoard({ ...busy, resources: { ...busy.resources, GEMS: 0 } }, NOW).job?.rush.blockers).toEqual([{ code: 'insufficient_resources', message: 'Not enough Crowns.' }]);
    expect(b.refresh).toEqual({ blockers: [{ code: 'busy', message: 'Finish scouting your current player first.' }], canRefresh: false });
    for (const p of b.prospects) expect(p.blockers[0]).toEqual({ code: 'busy', message: 'A player is already being scouted.' });
    expect(b.prospects.map(p => p.prospectId)).not.toContain(candidateId); // recruit.start removed it from the board
    const broke = { ...scoutingBoardState(), resources: { ...scoutingBoardState().resources, COINS: 0 } };
    for (const p of scoutingBoard(broke, NOW).prospects) expect(p.blockers).toEqual([{ code: 'insufficient_resources', message: 'Not enough coins.' }]);
  });

  it('the scouting job becomes signable exactly at its finish time', () => {
    const { state, candidateId } = scoutingJobState();
    const finish = state.recruitSlot!.finishTime;
    const before = scoutingBoard(state, finish - 1).job!;
    expect(before.sign).toEqual({ canSign: false, blockers: [{ code: 'not_ready', message: 'The prospect is not ready to sign.' }] });
    expect(before.remainingSeconds).toBe(1);
    const at = scoutingBoard(state, finish).job!;
    expect(at.ready).toBe(true);
    expect(at.sign.canSign).toBe(true);
    expect(at.rush.blockers).toEqual([{ code: 'not_ready', message: 'This player is already ready to sign.' }]);
    const signed = act(state, { type: 'recruit.sign' }, context(finish)).state;
    expect(signed.roster.some(p => p.id === candidateId)).toBe(true);
    expect(scoutingBoard(signed, finish).job).toBeNull();
  });

  it('flags stale boards without touching them', () => {
    const s = scoutingBoardState();
    const signedTwice = { ...s, roster: [...s.roster, { ...s.recruitBoard!.candidates[1] }] };
    expect(scoutingBoard(signedTwice, NOW).board).toMatchObject({ kind: 'issued', stale: true, staleReasons: ['candidate-signed'] });
    expect(scoutingBoard({ ...s, recruitBoard: { candidates: [], generatedAt: NOW } }, NOW).board).toMatchObject({ stale: true, staleReasons: ['empty'] });
    expect(scoutingBoard({ ...s, recruitBoard: { ...s.recruitBoard!, generatedAt: NOW + 5000 } }, NOW).board).toMatchObject({ stale: true, staleReasons: ['future-generated'] });
    const { state: busy, candidateId } = scoutingJobState();
    const echoed = { ...busy, recruitBoard: { ...busy.recruitBoard!, candidates: [busy.recruitSlot!.candidate, ...busy.recruitBoard!.candidates] } };
    expect(scoutingBoard(echoed, NOW).board).toMatchObject({ stale: true, staleReasons: ['candidate-in-slot'] });
    expect(scoutingBoard(echoed, NOW).prospects.find(p => p.prospectId === candidateId)?.prospectId).toBe(candidateId);
    expect(scoutingBoard(baseState(), NOW).board.kind).toBe('none');
    expect(prospectComparison(baseState(), 'nobody')).toBeNull();
  });

  it('is pure across states', () => {
    const a = scoutingJobState().state;
    const snapshot = JSON.stringify(a);
    scoutingBoard(a, NOW);
    expect(JSON.stringify(a)).toBe(snapshot);
    const b = scoutingBoard(scoutingBoardState(), NOW);
    expect(b.job).toBeNull();
  });
});
