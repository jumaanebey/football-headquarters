import { describe, expect, it } from 'vitest';
import { BACKUP_KEYS, createBackup } from '../backup';

describe('portable club backups', () => {
  it('exports progress without including live authentication or player identity', () => {
    const stored: Record<string, string> = {
      fhq_save_v1: '{"teamName":"Test Club"}', fhq_tutorial_done_v1: '1',
      fhq_session_v1: '{"access_token":"private-access","refresh_token":"private-refresh"}',
      fhq_pid: 'private-player-id',
    };
    const file = JSON.stringify(createBackup({ getItem: key => stored[key] ?? null }));
    expect(file).toContain('Test Club');
    expect(file).not.toContain('private-');
    expect(file).not.toContain('fhq_session');
  });
  it('legacy backup imports cannot overwrite the current session', () => {
    const legacy = { fhq_save_v1: 'club data', fhq_session_v1: 'another account', fhq_pid: 'another identity' };
    const imported = Object.fromEntries(BACKUP_KEYS.map(key => [key, legacy[key as keyof typeof legacy]]));
    expect(imported.fhq_save_v1).toBe('club data');
    expect(imported).not.toHaveProperty('fhq_session_v1');
    expect(imported).not.toHaveProperty('fhq_pid');
  });
});
