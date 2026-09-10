// Reconstructed from the deployed `club-authority` edge-function bundle
// (supabase/functions/club-authority/index.ts, "// game/authority/protection.ts" section).
//
// The bundle was tree-shaken: only `authorityProtectionRequired` and its private `read`
// helper (plus the module state they touch) survived. The original module also owned the
// writers that populate `sessionProtection` / `storageFailed` and the stored record itself
// (the `var` bindings below are never reassigned in the surviving code, which is how we
// know setters existed). Those other exports are unrecoverable from the bundle and are
// intentionally NOT reinvented here.

const KEY = 'fhq_authority_protection_v1';

interface AuthorityProtection {
  viewOwner: string;
  pending: boolean;
  owners: string[];
}

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

let sessionProtection: AuthorityProtection | null = null;
let storageFailed = false;

function read(storage?: Storage): AuthorityProtection | null {
  if (!storage && storageFailed) return sessionProtection;
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null');
    if (!value || !uuid(value.viewOwner) || typeof value.pending !== 'boolean' || !Array.isArray(value.owners) || !value.owners.every(uuid)) return null;
    return value;
  } catch {
    return storage ? null : sessionProtection;
  }
}

export function authorityProtectionRequired(storage?: Storage): boolean {
  return read(storage) !== null;
}
