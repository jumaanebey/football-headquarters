import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { BuildingInstance, UpgradeJob } from '../types';
import { sfx } from '../sound';

type Celebration = { id: string; at: number } | null;
/** Fire presentation effects only after a completed upgrade has committed. */
export function useUpgradeCelebrations(upgrades: UpgradeJob[], buildings: BuildingInstance[], setCelebration: Dispatch<SetStateAction<Celebration>>) {
  const previous = useRef(upgrades);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const finished = previous.current.filter(job => job.kind === 'building' && !upgrades.some(u => u.id === job.id)
      && buildings.some(b => b.id === job.key && b.level >= job.toLevel));
    previous.current = upgrades;
    const latest = finished[finished.length - 1];
    if (!latest) return;
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setCelebration({ id: latest.key, at: Date.now() });
    sfx.sign();
    clearTimer.current = setTimeout(() => setCelebration(null), 2400);
  }, [upgrades, buildings, setCelebration]);
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);
}
