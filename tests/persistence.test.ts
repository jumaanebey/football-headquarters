import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { loadState, SAVE_KEY, SaveLoadError, parseSavedClub } from '../game/persistence';
const now = new Date(2026, 8, 8, 12).getTime();
function memoryStorage(values: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(values));
  return { get length() { return data.size; }, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear(), key: n => [...data.keys()][n] ?? null };
}
describe('club persistence', () => {
  it('loads progress and backfills versioned fields', () => {
    const old = createInitialState(now) as any; old.resources.COINS = 1234; delete old.heroes; delete old.gauntlet; delete old.formation;
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify(old) }), restored = loadState(storage, now + 1000);
    expect(restored.resources.COINS).toBe(1234); expect(restored.heroes.length).toBeGreaterThan(0);
    expect(restored.formation).toBe('goalline'); expect(restored.gauntlet.attempts).toBe(3);
    expect(storage.getItem('fhq_save_backup_boot')).toBe(JSON.stringify(old));
  });
  it('refuses malformed saves without overwriting them or the last readable backup', () => {
    const backup = JSON.stringify(createInitialState(now)), storage = memoryStorage({ [SAVE_KEY]: '{broken', fhq_save_backup_boot: backup });
    expect(() => loadState(storage, now)).toThrow(SaveLoadError);
    expect(storage.getItem(SAVE_KEY)).toBe('{broken'); expect(storage.getItem('fhq_save_backup_boot')).toBe(backup);
  });
  it.each(['null', '[]', '{}', '{"resources":{}}'])('rejects non-club JSON: %s', raw => { expect(() => parseSavedClub(raw)).toThrow(); });
  it('rejects broken roster positions before an import can replace progress', () => {
    const state = createInitialState(now) as any; state.roster[0].worldPos = null;
    expect(() => parseSavedClub(JSON.stringify(state))).toThrow(SaveLoadError);
  });
  it('allows guest play when browser storage is unavailable', () => {
    const storage = memoryStorage(); storage.getItem = () => { throw new Error('storage blocked'); };
    expect(loadState(storage, now).resources.COINS).toBe(500);
  });
  it('rejects an explicit null upgrade queue rather than mounting a broken game', () => {
    const state = createInitialState(now) as any; state.upgrades = null;
    expect(() => parseSavedClub(JSON.stringify(state))).toThrow(SaveLoadError);
  });
  it('recovers energy within caps after an offline interval', () => {
    const state = createInitialState(now); state.resources.ENERGY = 0; state.shieldUntil = now + 86_400_000;
    const restored = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(state) }), now + 3600_000);
    expect(restored.resources.ENERGY).toBe(100); expect(restored.lastTick).toBe(now + 3600_000);
  });
});
