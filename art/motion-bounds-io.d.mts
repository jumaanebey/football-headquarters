export type MotionBounds = Record<string, number[][]>;
export const MOTION_BOUNDS_FILE: string;
export function readMotionBounds(file?: string): MotionBounds;
export function mergeMotionBounds(existing: MotionBounds, updates: MotionBounds): MotionBounds;
export function writeMotionBounds(updates: MotionBounds, file?: string): MotionBounds;
