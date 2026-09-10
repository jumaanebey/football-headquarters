import React from 'react';
import type { GameState } from '../types';
import { CAMPAIGN_STAGES } from '../campaign';
import { FORMATIONS } from '../fixedBase';
export function DesktopClubPanel({ state, onGames, onHeroes, onDefense, onRanks, onShare }: { state: GameState; onGames: () => void; onHeroes: () => void; onDefense: () => void; onRanks: () => void; onShare: () => void }) {
 const next = CAMPAIGN_STAGES[Math.min(state.campaign.unlocked, CAMPAIGN_STAGES.length)-1];
 const latest = state.matchHistory[0];
 const button = 'w-full min-h-11 rounded-xl border border-slate-600 px-3 py-3 text-left text-sm font-bold text-white hover:bg-slate-800';
 return <aside aria-label="Club command center" className="fhq-desktop-club space-y-4 border-l border-slate-700 bg-slate-950/95 p-5">
   <div><p className="text-xs uppercase tracking-widest text-orange-300">Club command center</p><h2 className="mt-2 text-xl font-bold text-white">{state.teamName}</h2></div>
   <section className="space-y-2"><h3 className="font-bold text-slate-200">Your next challenge</h3><p className="text-sm text-slate-300">{next.name} · {next.opponent}</p><button onClick={onGames} className={button}>Prepare your next game →</button></section>
   <section className="space-y-2"><h3 className="font-bold text-slate-200">Preparation</h3><p className="text-sm text-slate-300">Readiness {state.teamReadiness}% · {state.heroes.filter(h => h.unlocked).length} unlocked heroes</p><button onClick={onHeroes} className={button}>Train heroes & practice signatures</button></section>
   <section className="space-y-2"><h3 className="font-bold text-slate-200">Protect home field</h3><p className="text-sm text-slate-300">{FORMATIONS[state.formation].name} · {state.defenseLog.filter(d => !d.seen).length} unread defense records</p><button onClick={onDefense} className={button}>Review defense & gate assignments</button></section>
   <button onClick={onRanks} className={button}>Standings & campaign coaches</button>
   {latest && <section className="border-t border-slate-700 pt-4 space-y-2"><h3 className="font-bold text-slate-200">Last collected result</h3><p className="text-sm text-slate-300">{latest.won ? 'Won' : 'Lost'} · {latest.ourScore}/3 Game Balls · {latest.opponent}</p><button onClick={onShare} className={button}>Make result card</button></section>}
 </aside>;
}
