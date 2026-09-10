// Support diagnostics export for protected clubs. Produces a small, self-describing report that
// explains a connection failure with build and rules versions, outcome codes, latencies and
// pending/confirmed counts — and nothing else. It never reads the ledger's request bodies
// (which carry actions, films and the legacy save), server messages, tokens, club saves,
// full account ids or the player's club name. Redaction happens at the source: every string
// that reaches the report passes through `code()`, which keeps only short identifier-shaped
// values. Presentation (Settings › Connection details) is Codex-owned; this module is
// the tested serializer behind any future "copy diagnostics" control.
import { COMBAT_RULES_VERSION } from '../combat/actions';
import type { AuthorityClient } from './authorityClient';

declare const __BUILD_TS__: string | undefined;

export interface AuthorityDiagnosticsReport {
  format: 'fhq-authority-diagnostics/1';
  exportedAt: string;
  build: string;
  rules: string;
  /** First eight characters of the account id: enough to find a club, not enough to address one. */
  owner: string | null;
  availability: { status: string; at: string | null };
  counts: { pending: number; failed: number; confirmed: number };
  averageConfirmLatencyMs: number | null;
  /** Newest last; bounded by the client's own ring (40). */
  recent: Array<{ at: string; kind: string; op?: string; outcome: string; code?: string; latencyMs?: number; revision?: number }>;
  /** Unfinished ledger entries only: what a retry will resend, identified by short id and kind. */
  unfinished: Array<{ op: string; kind: string; state: string; code?: string; ageMs: number }>;
}

const IDENT = /^[a-z0-9][a-z0-9_.-]{0,31}$/i;
/** Only identifier-shaped strings survive; anything else (messages, tokens, JSON) becomes `redacted`. */
export const code = (value: unknown): string | undefined => value === undefined || value === null ? undefined : typeof value === 'string' && IDENT.test(value) ? value : 'redacted';
const iso = (ms: number | null | undefined) => Number.isFinite(ms) ? new Date(ms as number).toISOString() : null;
const shortOwner = (owner: string | null | undefined) => typeof owner === 'string' && /^[0-9a-f]{8}-/i.test(owner) ? owner.slice(0, 8) : null;
const round = (n: unknown) => Number.isFinite(n) ? Math.round(n as number) : undefined;

export interface DiagnosticsExportOptions { owner?: string | null; now?: () => number; build?: string }

export function buildAuthorityDiagnosticsReport(client: Pick<AuthorityClient, 'diagnostics' | 'ledger'>, options: DiagnosticsExportOptions = {}): AuthorityDiagnosticsReport {
  const now = options.now?.() ?? Date.now();
  const owner = options.owner ?? null;
  const diag = client.diagnostics(owner ?? undefined);
  const ledger = owner ? client.ledger(owner) : [];
  return {
    format: 'fhq-authority-diagnostics/1',
    exportedAt: new Date(now).toISOString(),
    build: options.build ?? (typeof __BUILD_TS__ === 'string' ? __BUILD_TS__ : 'dev'),
    rules: COMBAT_RULES_VERSION,
    owner: shortOwner(owner),
    availability: { status: code(diag.availability.status) ?? 'unknown', at: iso(diag.availability.at) },
    counts: { pending: diag.pending, failed: diag.failed, confirmed: diag.confirmed },
    averageConfirmLatencyMs: diag.averageConfirmLatencyMs,
    recent: diag.events.slice(-40).map(e => ({
      at: iso(e.at) ?? 'invalid', kind: code(e.kind) ?? 'unknown', op: code(e.operationId)?.slice(0, 8), outcome: code(e.outcome) ?? 'unknown',
      code: code(e.code), latencyMs: round(e.latencyMs), revision: round(e.revision),
    })),
    unfinished: ledger.filter(e => e.state !== 'confirmed').slice(-50).map(e => ({ op: e.operationId.slice(0, 8), kind: code(e.kind) ?? 'unknown', state: code(e.state) ?? 'unknown', code: code(e.code), ageMs: Math.max(0, now - e.at) })),
  };
}

/** Pretty JSON with undefined fields dropped; what a player would paste into a support message. */
export const serializeAuthorityDiagnostics = (report: AuthorityDiagnosticsReport): string => JSON.stringify(report, (_k, v) => v === undefined ? undefined : v, 2);

/** One-line summary for a status row or a bug title. */
export const summarizeAuthorityDiagnostics = (r: AuthorityDiagnosticsReport): string =>
  `${r.rules} · build ${r.build} · server ${r.availability.status} · ${r.counts.confirmed} confirmed, ${r.counts.pending} pending, ${r.counts.failed} failed${r.averageConfirmLatencyMs != null ? ` · ~${r.averageConfirmLatencyMs} ms` : ''}`;
