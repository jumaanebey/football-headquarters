export interface FunnelStepCount { step: string; label: string; players: number; direct: number; legacyDerived: number; pct: number | null; source: string }
export interface FunnelCohort { day: string; newPlayers: number; d1Observable: number; d1: number; d7Observable: number; d7: number }
export interface FunnelMalformed { total: number; reasons: { notObject: number; missingPid: number; badEvent: number; badTs: number; badProps: number } }
export interface FunnelDistinctions { resultsNotConfirmed: number; upgradesRequestedNotCompleted: number; backupPromptNotCompleted: number; backupMethods: { export: number; account: number }; backupUnknownMethod: number }
export interface FunnelReport {
  window: { from: string; to: string; days: number; timezone: string };
  data: string;
  malformed: FunnelMalformed;
  denominator: number; events: number;
  qa: { rows: number; players: number; marker: string };
  steps: FunnelStepCount[];
  distinctions: FunnelDistinctions;
  returnCohorts: FunnelCohort[];
  returningInWindow: number;
}
export type FunnelRow = { pid: string; event: string; props?: Record<string, unknown> | null; ts: string };
export const DAY: number;
export const FUNNEL: Array<[string, string, string[]]>;
export const BACKUP_METHODS: string[];
export function sanitizeRows(rows: unknown): { rows: Array<FunnelRow & { t: number; props: Record<string, unknown> }>; malformed: FunnelMalformed };
export function computeFunnel(rows: unknown, options?: { now?: number; days?: number; qaPids?: Set<string> }): FunnelReport;
export function renderFunnel(report: FunnelReport): string;
export function fetchRows(url: string, key: string, since: string, options?: { fetchImpl?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>; page?: number; until?: string }): Promise<FunnelRow[]>;
export function FIXTURE_BANNER(path: string): string;
