import { Sheet } from './ui';
import React from 'react';
import { GameState } from '../types';
import { getObjectives, IconKey, GoalId } from '../objectives';
import { Coins, CheckCircle2, Trophy, Clock, Zap, Dumbbell, Shield, ArrowUpCircle, Users, ChevronRight } from 'lucide-react';

interface Props {
  gameState: GameState;
  onGoal: (id: GoalId) => void;
  /** Daily Practice lives INSIDE the Goals panel — one "what do I do now" surface
   *  (the floating gift button doubled this panel and explained nothing). */
  dailyClaimable?: number;
  onOpenDailies?: () => void;
}

const ICONS: Record<IconKey, React.ReactNode> = {
  coins: <Coins size={16} />,
  check: <CheckCircle2 size={16} />,
  trophy: <Trophy size={16} />,
  clock: <Clock size={16} />,
  zap: <Zap size={16} />,
  dumbbell: <Dumbbell size={16} />,
  shield: <Shield size={16} />,
  arrowUp: <ArrowUpCircle size={16} />,
  swords: <span className="text-base leading-none">🏈</span>,
  users: <Users size={16} />,
};

export const ObjectiveBanner: React.FC<Props> = ({ gameState, onGoal, dailyClaimable = 0, onOpenDailies }) => {
  const goals = getObjectives(gameState);
  const [open, setOpen] = React.useState(false);

  return <>
    <div className="fhq-objectives fixed z-30">
      <button type="button" aria-label={`Coach’s checklist (${goals.length})`} aria-haspopup="dialog" onClick={()=>setOpen(true)} className="min-h-11 w-full flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-950/95 px-3 py-2 text-sm font-bold text-slate-200">
        <CheckCircle2 size={16} />Checklist{dailyClaimable>0 && <span className="rounded-full bg-rose-600 px-1.5 text-xs text-white">{dailyClaimable}</span>}
      </button>
    </div>
    {open && <Sheet title="Coach’s checklist" subtitle="Choose your next step, then get back to campus." onClose={()=>setOpen(false)} maxWidth="max-w-lg">
      <div className="p-4 space-y-3">
        {onOpenDailies && <button onClick={()=>{setOpen(false);onOpenDailies();}} className="w-full rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-left text-white"><strong className="block">Daily Practice</strong><span className="text-sm text-amber-200">{dailyClaimable>0 ? `${dailyClaimable} rewards ready to claim` : 'Today’s three drills for Crowns'}</span></button>}
        {goals.map(g=><button key={g.id} onClick={()=>{setOpen(false);onGoal(g.id);}} className="w-full flex gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 text-left text-white"><span className="mt-1 text-sky-300">{ICONS[g.iconKey]}</span><span className="flex-1"><strong className="block">{g.text}</strong>{g.progress && <span className="mt-2 block text-sm text-slate-300">{g.progress.cur} / {g.progress.max}</span>}</span><ChevronRight size={18} /></button>)}
      </div>
    </Sheet>}
  </>;
};
