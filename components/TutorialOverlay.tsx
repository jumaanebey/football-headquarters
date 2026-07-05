
import React, { useState } from 'react';
import { Sparkles, ArrowDownCircle, ListChecks, MousePointerClick, Dices, Swords } from 'lucide-react';

interface Props {
  initialName: string;
  onRerollName: () => string;
  onDone: (teamName: string, startRaid: boolean) => void;
}

// First-session experience: claim your club, learn the 3 live cues, then straight into
// your first raid. The real teaching happens live (Goals panel + arrow + glows).
export const TutorialOverlay: React.FC<Props> = ({ initialName, onRerollName, onDone }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const clean = name.trim().slice(0, 24) || initialName;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-orange-600 to-red-700 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-slate-900/40 border-2 border-white/30 flex items-center justify-center text-3xl">
            {step === 0 ? '🏈' : <Sparkles size={34} className="text-white" />}
          </div>
        </div>

        {step === 0 ? (
          <div className="p-6 text-center">
            <h2 className="text-2xl font-display font-bold text-white mb-1">Welcome, Coach</h2>
            <p className="text-slate-400 text-sm mb-5">Every dynasty starts with a name. What's your club called?</p>
            <div className="flex gap-2 mb-5">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={24}
                className="flex-1 min-w-0 bg-slate-800 border border-slate-600 focus:border-orange-400 outline-none rounded-xl px-4 py-3 text-white font-bold text-center"
                placeholder="Your club name"
              />
              <button onClick={() => setName(onRerollName())} title="Random name"
                className="shrink-0 p-3 rounded-xl bg-slate-800 border border-slate-600 hover:border-orange-400 text-slate-300 hover:text-white transition-colors">
                <Dices size={20} />
              </button>
            </div>
            <button onClick={() => setStep(1)} className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg transition-colors active:scale-95">
              That's my club →
            </button>
          </div>
        ) : (
          <div className="p-6 text-center">
            <h2 className="text-2xl font-display font-bold text-white mb-1">{clean}</h2>
            <p className="text-slate-400 text-sm mb-5">Build your stadium, train heroes, raid rivals. You'll never be lost —</p>

            <div className="space-y-3 text-left mb-6">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><ListChecks size={18} className="text-blue-400" /></span>
                <p className="text-sm text-slate-300">The <span className="text-white font-bold">Goals panel</span> (top-left) always has your next moves.</p>
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

            <button onClick={() => onDone(clean, true)} className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-lg transition-colors active:scale-95 flex items-center justify-center gap-2 mb-2">
              <Swords size={20} /> Storm your first rival!
            </button>
            <button onClick={() => onDone(clean, false)} className="w-full py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors">
              Look around first
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
