export const SAVE_KEY = 'farEmpires.save';
export const AUTOSAVE_KEY = 'farEmpires.autosave';

export function saveGame(game, key = SAVE_KEY) {
  try {
    const data = game.serialize();
    data.savedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) { console.error('save failed', e); return false; }
}
export function loadGameData(key = SAVE_KEY) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
export function hasSave(key = SAVE_KEY) { return !!localStorage.getItem(key); }
