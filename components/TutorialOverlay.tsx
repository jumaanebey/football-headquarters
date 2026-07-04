
import React from 'react';
import { Sparkles, ArrowDownCircle, ListChecks, MousePointerClick } from 'lucide-react';

interface Props {
  onDone: () => void;
}

// Lightweight first-run welcome. The real teaching happens live via the always-on
// "Next Step" banner and the bouncing arrow, so this just hands off to them.
export const TutorialOverlay: React.FC<Props> = ({ onDone }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
    <div className="bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
      <div className="h-24 bg-gradient-to-br from-blue-700 to-indigo-800 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-slate-900/40 border-2 border-white/30 flex items-center justify-center">
          <Sparkles size={34} className="text-white" />
        </div>
      </div>

      <div className="p-6 text-center">
        <h2 className="text-2xl font-display font-bold text-white mb-1">Welcome, Coach</h2>
        <p className="text-slate-400 text-sm mb-5">Run your football franchise: collect, train, recruit, and win your season. You’ll never be lost —</p>

        <div className="space-y-3 text-left mb-6">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><ListChecks size={18} className="text-blue-400" /></span>
            <p className="text-sm text-slate-300">The <span className="text-white font-bold">Next Step</span> bar up top always tells you what to do.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><ArrowDownCircle size={18} className="text-yellow-400" /></span>
            <p className="text-sm text-slate-300">A <span className="text-yellow-300 font-bold">bouncing arrow</span> points right at the thing to tap.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><MousePointerClick size={18} className="text-green-400" /></span>
            <p className="text-sm text-slate-300">Anything <span className="text-white font-bold">glowing</span> is ready for you to tap.</p>
          </div>
        </div>

        <button onClick={onDone} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition-colors">
          Let’s Go!
        </button>
      </div>
    </div>
  </div>
);
