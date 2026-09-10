// The campus art gate: returning players open it at boot, new players when naming completes,
// and a safety timer prevents a permanently blank campus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armCampusArtGate, campusArtOpen, campusArtReady, openCampusArt, resetCampusArtGateForTests } from '../game/artGate';
import { TUTORIAL_KEY } from '../game/persistence';

beforeEach(() => { vi.useFakeTimers(); resetCampusArtGateForTests(); });
afterEach(() => { vi.useRealTimers(); });

describe('campus art gate', () => {
  it('opens immediately for a returning player', () => {
    armCampusArtGate({ getItem: k => k === TUTORIAL_KEY ? '1' : null });
    expect(campusArtOpen()).toBe(true);
  });
  it('stays closed for a new player until naming completes', async () => {
    armCampusArtGate({ getItem: () => null });
    expect(campusArtOpen()).toBe(false);
    let resolved = false; void campusArtReady().then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);
    openCampusArt();
    await vi.advanceTimersByTimeAsync(0);
    expect(campusArtOpen()).toBe(true); expect(resolved).toBe(true);
  });
  it('opens on the safety timer and tolerates blocked storage', async () => {
    armCampusArtGate({ getItem: () => { throw new Error('blocked'); } });
    expect(campusArtOpen()).toBe(false);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(campusArtOpen()).toBe(true);
  });
});
