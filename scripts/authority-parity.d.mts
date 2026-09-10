export interface ParityLine { level: 'pass' | 'fail' | 'info'; text: string }
export interface ParityResult { ok: boolean; lines: ParityLine[]; deployment: 'current' | 'lagging' | 'unknown' }
export function sha256(text: string | Uint8Array): string;
export function findSecretShapes(text: string): string[];
export function checkAuthorityParity(input: { root: string; readable: string; minified: string; requireDeployedCurrent?: boolean; git?: boolean }): Promise<ParityResult>;
