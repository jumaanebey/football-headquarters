import type {GameState} from '../types';
import {questsForDate} from '../dailies';

export function progressClubDaily(state: GameState, questId: string, count = 1): GameState {
  const quest = questsForDate(state.dailies.date).find(value => value.id === questId);
  if (!quest || state.dailies.claimed.includes(questId) || !Number.isFinite(count) || count <= 0) return state;
  const progress = Math.min(quest.target, (state.dailies.progress[questId] ?? 0) + count);
  return { ...state, dailies: { ...state.dailies, progress: { ...state.dailies.progress, [questId]: progress } } };
}
