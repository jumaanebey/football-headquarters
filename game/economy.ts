import { BuildingType, DrillState, type BuildingInstance, type GameState, type UpgradeJob } from '../types';
import { COLLECTOR_CONFIG, collectorCap, collectorRate, energyIntervalMs } from '../constants';

/** Bounded by upgrade count, not elapsed seconds. Each rate applies only while
 * that level actually existed, including upgrades completed during an absence. */
function levelTimeline(building: BuildingInstance, jobs: UpgradeJob[], from: number, to: number) {
  const upgrades = jobs.filter(job => job.kind === 'building' && job.key === building.id && job.finishTime <= to)
    .sort((a, b) => a.finishTime - b.finishTime);
  let level = building.level, cursor = from;
  const segments: { from: number; to: number; level: number }[] = [];
  for (const upgrade of upgrades) {
    if (upgrade.finishTime > from) {
      segments.push({ from: cursor, to: upgrade.finishTime, level });
      cursor = upgrade.finishTime;
    }
    level = Math.max(level, upgrade.toLevel);
  }
  segments.push({ from: cursor, to, level });
  return segments;
}

/** One economy transition for active, hidden, and reopened clubs. */
export function advanceEconomy(previous: GameState, now: number) {
  const from = previous.lastTick;
  const completedJobs = previous.upgrades.filter(job => job.finishTime <= now);
  const buildings = previous.buildings.map(building => {
    const segments = levelTimeline(building, previous.upgrades, from, now);
    const collector = COLLECTOR_CONFIG[building.type];
    let accrued = building.accrued ?? 0;
    if (collector) for (const segment of segments) {
      const seconds = Math.min(Math.max(0, segment.to - segment.from) / 1000, collector.maxOfflineSeconds);
      accrued = Math.min(collectorCap(building.type, segment.level), accrued + collectorRate(building.type, segment.level) * seconds);
    }
    const level = segments[segments.length - 1].level;
    const state = building.state === DrillState.ACTIVE && building.finishTime != null && now >= building.finishTime
      ? DrillState.COMPLETED : building.state;
    return level !== building.level || state !== building.state || (collector && accrued !== building.accrued)
      ? { ...building, level, state, ...(collector ? { accrued } : {}) } : building;
  });

  const rehab = previous.buildings.find(building => building.type === BuildingType.MEDICAL_CENTER);
  const energySegments = rehab ? levelTimeline(rehab, previous.upgrades, from, now) : [{ from, to: now, level: 1 }];
  let energy = Math.min(100, previous.resources.ENERGY);
  let interval = energyIntervalMs(rehab?.level ?? 1);
  let energyProgressMs = Math.min(interval, previous.energyProgressMs ?? 0);
  for (const segment of energySegments) {
    const nextInterval = energyIntervalMs(segment.level);
    // Preserve fractional progress when an upgrade changes the regeneration rate.
    energyProgressMs = energyProgressMs / interval * nextInterval;
    interval = nextInterval;
    if (energy >= 100) { energyProgressMs = 0; continue; }
    const total = energyProgressMs + Math.max(0, segment.to - segment.from);
    const ticks = Math.floor((total + 1e-7) / interval);
    energy = Math.min(100, energy + ticks);
    energyProgressMs = energy >= 100 ? 0 : Math.max(0, total - ticks * interval);
  }

  return {
    buildings, energyProgressMs,
    heroes: completedJobs.some(job => job.kind === 'hero') ? previous.heroes.map(hero => {
      const level = completedJobs.filter(job => job.kind === 'hero' && job.key === hero.key).reduce((best, job) => Math.max(best, job.toLevel), hero.level);
      return level !== hero.level ? { ...hero, level } : hero;
    }) : previous.heroes,
    upgrades: completedJobs.length ? previous.upgrades.filter(job => now < job.finishTime) : previous.upgrades,
    resources: energy !== previous.resources.ENERGY ? { ...previous.resources, ENERGY: energy } : previous.resources,
  };
}
