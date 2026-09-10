// Device record for a club that is settled by the authority service ("online protection").
// While a record names the signed-in account as `viewOwner`, the local save is only a mirror
// of the last server-confirmed state: persistence returns it untouched and every club change
// goes through the authority client. `owners` lists every account protected on this device.
//
// Provenance: the deployed club-authority v2 bundle preserved only the read path of this
// module (`authorityProtectionRequired` and its shape); the write helpers below are new.
const KEY = 'fhq_authority_protection_v1';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export interface AuthorityProtection { viewOwner: string; pending: boolean; owners: string[] }

let sessionProtection: AuthorityProtection | null = null;
let storageFailed = false;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

function read(storage?: StorageLike): AuthorityProtection | null {
  if (!storage && storageFailed) return sessionProtection;
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null');
    if (!value || !uuid(value.viewOwner) || typeof value.pending !== 'boolean' || !Array.isArray(value.owners) || !value.owners.every(uuid)) return null;
    return value;
  } catch {
    return storage ? null : sessionProtection;
  }
}
function write(value: AuthorityProtection | null, storage?: StorageLike): void {
  sessionProtection = value;
  const target = store(storage);
  try {
    if (!target) throw new Error('no storage');
    if (value) target.setItem(KEY, JSON.stringify(value)); else target.removeItem(KEY);
    storageFailed = false;
  } catch { storageFailed = true; }
}

/** True when this device holds a protected club: the save must not be migrated or advanced locally. */
export function authorityProtectionRequired(storage?: Storage): boolean {
  return read(storage) !== null;
}
export function readAuthorityProtection(storage?: StorageLike): AuthorityProtection | null {
  return read(storage);
}
/** Marks `owner`'s club as protected and makes it the club this device views. */
export function enableAuthorityProtection(owner: string, storage?: StorageLike): AuthorityProtection {
  if (!uuid(owner)) throw new TypeError('Invalid protection owner.');
  const previous = read(storage);
  const next = { viewOwner: owner, pending: false, owners: [...new Set([...(previous?.owners ?? []), owner])] };
  write(next, storage);
  return next;
}
/** Records whether an operation for the viewed club is still awaiting the server's answer. */
export function setAuthorityProtectionPending(pending: boolean, storage?: StorageLike): void {
  const current = read(storage);
  if (current && current.pending !== pending) write({ ...current, pending }, storage);
}
const SAVE_KEY = 'fhq_save_v1';
const PRESERVE_KEY = 'fhq_backup_preprotect';
/** Before a server club replaces whatever this device holds, keep the device's club as a readable
 * backup (`fhq_backup_preprotect`). Called when protection is enabled and when a signed-in account's
 * protected club is adopted on a device that was not already mirroring it. Returns whether a copy was kept. */
export function preserveLocalClub(storage?: StorageLike): boolean {
  const target = store(storage);
  if (!target) return false;
  try {
    const current = target.getItem(SAVE_KEY);
    if (!current) return false;
    target.setItem(PRESERVE_KEY, current);
    target.setItem(`${PRESERVE_KEY}_at`, String(Date.now()));
    return true;
  } catch { return false; }
}
/** Removes protection for this device only; the server copy remains authoritative for its owner. */
export function clearAuthorityProtection(storage?: StorageLike): void {
  write(null, storage);
}
