
import React, { useEffect, useId, useRef, useState } from 'react';
import { Star, ListChecks, MousePointerClick, Dices } from 'lucide-react';

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
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const finished = useRef(false);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const finish = (startGame: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone(clean, startGame);
  };
  const containFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, input') ?? []).filter(el => el.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return (
    <div className="fhq-onboarding fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={containFocus} className="fhq-onboarding-panel bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-700 shadow-2xl overflow-y-auto overscroll-contain">
        <div className="fhq-onboarding-brand h-28 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 flex items-center justify-center px-6">
          <img src="/assets/brand/logo.webp" alt="Football Headquarters" className="max-h-24 w-auto drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
            onError={e => { (e.currentTarget as HTMLImageElement).outerHTML = '<span class="text-4xl">🏈</span>'; }} />
        </div>

        {step === 0 ? (
          <form className="p-6 text-center" onSubmit={event => { event.preventDefault(); setStep(1); }}>
            <h2 ref={heading} id={titleId} tabIndex={-1} className="text-2xl font-display font-bold text-white mb-1">Welcome, Coach</h2>
            <p className="text-slate-400 text-sm mb-5">Every dynasty starts with a name. What's your club called?</p>
            <div className="flex gap-2 mb-5">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={24}
                autoComplete="organization"
                enterKeyHint="next"
                aria-label="Your club name"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-600 focus:border-orange-400 outline-none rounded-xl px-4 py-3 text-white font-bold text-center"
                placeholder="Your club name"
              />
              <button type="button" onClick={() => setName(onRerollName())} title="Random name" aria-label="Random name"
                className="shrink-0 p-3 rounded-xl bg-slate-800 border border-slate-600 hover:border-orange-400 text-slate-300 hover:text-white transition-colors">
                <Dices size={20} />
              </button>
            </div>
            <button type="submit" className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg transition-colors active:scale-95">
              That's my club →
            </button>
          </form>
        ) : (
          <div className="p-6 text-center">
            <h2 ref={heading} id={titleId} tabIndex={-1} className="text-2xl font-display font-bold text-white mb-1">{clean}</h2>
            {/* This screen used to teach three BASE-screen cues (goals panel, bouncing
                arrow, glow) and then drop the player straight into the BATTLE screen,
                where none of them exist — "you'll never be lost" was falsified within
                ten seconds. Teach the screen they are actually about to see. */}
            <p className="text-slate-400 text-sm mb-5">Your first road game is the Preseason Opener. Here's your playbook.</p>

            <div className="space-y-3 text-left mb-6">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><Star size={18} className="text-amber-400" /></span>
                <p className="text-sm text-slate-300">Send in your <span className="text-white font-bold">hero</span>, then tap their <span className="text-yellow-300 font-bold">signature</span> when it's ready to turn the drive.</p>
              </div>
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
                <p className="text-sm text-slate-300">Back home, the <span className="text-white font-bold">Coach's checklist</span> has your next move. Open <span className="text-white font-bold">Heroes</span> to practice any signature for free.</p>
              </div>
            </div>

            <button type="button" onClick={() => finish(true)} className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg transition-colors active:scale-95 flex items-center justify-center gap-2 mb-2">
              <span className="text-xl leading-none">🏈</span> Play your first game →
            </button>
            <button type="button" onClick={() => finish(false)} className="min-h-11 w-full py-2 text-slate-300 hover:text-white text-sm font-bold transition-colors">
              Look around first
            </button>
            <button type="button" onClick={() => setStep(0)} className="min-h-11 w-full py-2 text-slate-400 hover:text-white text-sm transition-colors">Change club name</button>
          </div>
        )}
      </div>
    </div>
  );
};
