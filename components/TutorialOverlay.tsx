
import React, { useState } from 'react';
import { Sparkles, ArrowDownCircle, ListChecks, MousePointerClick, Dices } from 'lucide-react';

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
        <div className="h-28 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 flex items-center justify-center px-6">
          <img src="/assets/brand/logo.webp" alt="Football Headquarters" className="max-h-24 w-auto drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
            onError={e => { (e.currentTarget as HTMLImageElement).outerHTML = '<span class="text-4xl">🏈</span>'; }} />
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
            {/* This screen used to teach three BASE-screen cues (goals panel, bouncing
                arrow, glow) and then drop the player straight into the BATTLE screen,
                where none of them exist — "you'll never be lost" was falsified within
                ten seconds. Teach the screen they are actually about to see. */}
            <p className="text-slate-400 text-sm mb-5">You're up first against the worst team in the league. Here's all you need —</p>

            <div className="space-y-3 text-left mb-6">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><MousePointerClick size={18} className="text-green-400" /></span>
                <p className="text-sm text-slate-300">Tap a <span className="text-white font-bold">player card</span> at the bottom, then tap the <span className="text-yellow-300 font-bold">glowing sideline</span> to send them in.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><span className="text-lg leading-none">🏈</span></span>
                <p className="text-sm text-slate-300">Sack <span className="text-white font-bold">half their buildings</span> before the clock runs out and you win.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><ListChecks size={18} className="text-blue-400" /></span>
                <p className="text-sm text-slate-300">Afterwards, the <span className="text-white font-bold">Goals panel</span> back at your stadium always has your next move.</p>
              </div>
            </div>

            <button onClick={() => onDone(clean, true)} className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-lg transition-colors active:scale-95 flex items-center justify-center gap-2 mb-2">
              <span className="text-xl leading-none">🏈</span> Play your first game →
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
