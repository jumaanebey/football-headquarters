import React from 'react';
import { GameState, ResourceType, BuildingType } from '../types';
import { Sheet } from './ui';
import { clubPower, clubPowerBreakdown, rankFor } from '../ranks';
import { GROWTH_TIERS, collectorRate } from '../constants';
import { candidateOvr } from '../recruiting';
import { formationDef, masteryLevel } from '../fixedBase';

// ─── 🏙 CLUB DASHBOARD ─────────────────────────────────────────────────────────
// SimCity's advisor panel for Football HQ: every number here is a stat the game
// ALREADY tracks (no invented metrics) — fan base + campus growth, Club Power
// breakdown, competition standing, and day-to-day operations. Opened by tapping
// the jumbotron on the home board (the club's own big screen IS the dashboard).

const fmtNum = (n: number) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}K` : Math.floor(n).toLocaleString();

const Bar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
    <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
      style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }} />
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5">{title}</div>
    {children}
  </div>
);

const StatRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-xs text-slate-400">{label}</span>
    <span className="text-sm font-display font-bold text-white">{value}</span>
  </div>
);

export const ClubDashboard: React.FC<{ gs: GameState; onClose: () => void }> = ({ gs, onClose }) => {
  const fans = Math.floor(gs.resources[ResourceType.FANS] ?? 0);
  const energy = Math.floor(gs.resources[ResourceType.ENERGY] ?? 0);

  // Campus growth — same tiers that drive the board's props
  const tierIdx = GROWTH_TIERS.filter(t => fans >= t.fans).length;
  const curTier = tierIdx > 0 ? GROWTH_TIERS[tierIdx - 1] : null;
  const nextTier = GROWTH_TIERS[tierIdx] ?? null;
  const tierFloor = curTier?.fans ?? 0;
  const tierProg = nextTier ? (fans - tierFloor) / (nextTier.fans - tierFloor) : 1;

  // Competition
  const rankInfo = rankFor(gs.trophies);
  const seasonStars = Object.values(gs.campaign?.stars ?? {}).reduce((s, v) => s + v, 0);

  // Operations
  const stadium = gs.buildings.find(b => b.type === BuildingType.STADIUM);
  const coinsPerMin = Math.round(collectorRate(BuildingType.STADIUM, stadium?.level ?? 1) * 60);
  const avgOvr = gs.roster.length
    ? Math.round(gs.roster.reduce((s, p) => s + candidateOvr(p), 0) / gs.roster.length)
    : 0;

  // Defense record — the raid log (held = attacker left with zero game balls)
  const raids = gs.defenseLog ?? [];
  const held = raids.filter(r => r.stars === 0).length;
  const breached = raids.length - held;
  const mastery = masteryLevel(gs.formationMastery?.[gs.formation] ?? 0);

  const power = clubPower(gs);
  const breakdown = clubPowerBreakdown(gs);

  return (
    <Sheet title="Club Dashboard" icon={<span>🏙</span>}
      subtitle={<span>{gs.teamName} · {rankInfo.rank.name}</span>} onClose={onClose}>
      <div className="flex flex-col gap-3">

        <Card title="Fan base & campus">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-2xl font-display font-black text-white">👥 {fmtNum(fans)}<span className="text-xs font-bold text-slate-400 ml-1.5">fans</span></span>
            <span className="text-xs font-bold uppercase tracking-wide text-orange-300">{curTier ? curTier.name : 'Quiet campus'}</span>
          </div>
          <Bar pct={tierProg} />
          <div className="text-[11px] text-slate-500 mt-1.5">
            {nextTier
              ? <>Next: <span className="text-slate-300 font-bold">{nextTier.name}</span> at {nextTier.fans.toLocaleString()} fans — the campus builds out as your fan base grows</>
              : 'Your grounds are a full tailgate city — every campus stage unlocked'}
          </div>
        </Card>

        <Card title="Franchise — Club Power">
          <div className="text-2xl font-display font-black text-white mb-2">👑 {power.toLocaleString()}</div>
          <div className="flex flex-col divide-y divide-slate-800/60">
            {breakdown.map(b => (
              <StatRow key={b.label} label={`${b.emoji} ${b.label}`} value={b.pts.toLocaleString()} />
            ))}
          </div>
        </Card>

        <Card title="Competition">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-2xl font-display font-black text-white">🏆 {gs.trophies.toLocaleString()}</span>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: rankInfo.rank.color }}>{rankInfo.rank.name}</span>
          </div>
          <Bar pct={rankInfo.progress} />
          <div className="text-[11px] text-slate-500 mt-1.5 mb-1">
            {rankInfo.next ? <>Next tier: <span className="text-slate-300 font-bold">{rankInfo.next.name}</span> at {rankInfo.next.min.toLocaleString()} trophies</> : 'Top of the ladder'}
          </div>
          <StatRow label="📅 Season stage reached" value={gs.campaign?.unlocked ?? 1} />
          <StatRow label="🏈 Season game balls" value={seasonStars} />
        </Card>

        <Card title="Operations">
          <StatRow label="🎟 Ticket revenue" value={`${coinsPerMin.toLocaleString()} coins/min`} />
          <StatRow label="⚡ Energy" value={`${energy}/100`} />
          <StatRow label="👥 Roster" value={`${gs.roster.length} players · ${avgOvr} avg OVR`} />
          <StatRow label="📋 Scheme" value={`${formationDef(gs.formation).name}${mastery > 0 ? ` ${'★'.repeat(mastery)}` : ''}`} />
          {raids.length > 0 && <StatRow label="🛡 Raid defense record" value={`${held} held · ${breached} breached`} />}
        </Card>

      </div>
    </Sheet>
  );
};
