import { describe, expect, it } from 'vitest';
import { checkClubName, isValidClubName, CLUB_NAME_MAX } from '../game/clubName';
import { parseClubAction } from '../game/authority/clubActions';

const serverAccepts = (name: string) => parseClubAction({ type: 'club.rename', name }) !== null;
const cases: [string, string][] = [
  ['boundary min', 'ab'], ['below min', 'a'], ['below min after trim', ' a '], ['boundary max', 'x'.repeat(24)], ['over max', 'x'.repeat(25)],
  ['max after trim', ` ${'x'.repeat(24)} `], ['emoji counts two units', '\u{1F3C8}'.repeat(12)], ['emoji over', '\u{1F3C8}'.repeat(12) + 'x'], ['combining marks', 'Cáfé United FC'],
  ['control char', 'BadName'], ['newline', 'Bad\nName'], ['inner spaces', 'Storm   City   FC'], ['tab', 'Storm\tCity'], ['c1 control', 'TeamX'], ['zero-width joiner', 'Team \u{1F468}‍\u{1F4BB}'],
];

describe('club name rule is shared by client and server', () => {
  it.each(cases)('%s: client and server agree', (_label, name) => {
    expect(isValidClubName(name)).toBe(serverAccepts(name));
  });
  it('counts UTF-16 code units, exactly like the server', () => {
    expect(checkClubName('\u{1F3C8}'.repeat(12))).toMatchObject({ ok: true });
    expect(checkClubName('\u{1F3C8}'.repeat(12) + 'x')).toMatchObject({ ok: false, problem: 'long' });
    expect('\u{1F3C8}'.repeat(12).length).toBe(CLUB_NAME_MAX);
  });
  it('stores the trimmed, space-collapsed name the server would store', () => {
    expect(checkClubName('  Storm   City  ')).toEqual({ ok: true, name: 'Storm City' });
    const stored = parseClubAction({ type: 'club.rename', name: '  Storm   City  ' });
    expect(stored && 'name' in stored ? stored.name.trim().replace(/\s+/g, ' ') : null).toBe('Storm City');
  });
  it('explains each refusal', () => {
    expect(checkClubName('a')).toMatchObject({ ok: false, problem: 'short' });
    expect(checkClubName('x'.repeat(30))).toMatchObject({ ok: false, problem: 'long' });
    expect(checkClubName('xy')).toMatchObject({ ok: false, problem: 'control' });
  });
});
