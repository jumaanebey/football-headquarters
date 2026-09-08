/** Portable progress is data, not an authentication credential. Never export or import sessions. */
export const BACKUP_KEYS = ['fhq_save_v1', 'fhq_tutorial_done_v1', 'fhq_chalk_intro_v1'] as const;
export function createBackup(storage: Pick<Storage, 'getItem'>) {
  return { v: '1', exported: new Date().toISOString(), ...Object.fromEntries(BACKUP_KEYS.map(key => [key, storage.getItem(key)])) };
}
