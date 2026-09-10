export interface FunnelStepCount { step: string; label: string; players: number; direct: number; legacyDerived: number; pct: number | null; source: string }
export interface FunnelCohort { day: string; newPlayers: number; d1Observable: number; d1: number; d7Observable: number; d7: number }
export interface FunnelReport { window: { from: string; to: string; days: number }; data: string; denominator: number; events: number; qa: { rows: number; players: number; marker: string }; steps: FunnelStepCount[]; returnCohorts: FunnelCohort[]; returningInWindow: number }
export const FUNNEL: Array<[string, string, string[]]>;
export function computeFunnel(rows: Array<{ pid: string; event: string; props?: Record<string, unknown>; ts: string }>, options?: { now?: number; days?: number; qaPids?: Set<string> }): FunnelReport;
export function renderFunnel(report: FunnelReport): string;
