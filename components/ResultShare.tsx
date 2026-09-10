import React, { useEffect, useState } from 'react';
import type { MatchResult } from '../types';
import { Sheet } from './ui';

const GAME_URL = 'https://football-headquarters.vercel.app/';
/** Exports only player-visible result fields. No receipts, identifiers or reward claims. */
export async function resultCard(club: string, match: MatchResult): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export unavailable');
  ctx.fillStyle = '#091923'; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 2;
  for (let x = 60; x < 1200; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke(); }
  ctx.fillStyle = '#f97316'; ctx.fillRect(0, 0, 16, 630);
  const line = (text: string, y: number, size: number, color = '#fff') => {
    ctx.fillStyle = color; ctx.font = `bold ${size}px sans-serif`;
    while (ctx.measureText(text).width > 1040 && size > 18) ctx.font = `bold ${--size}px sans-serif`;
    ctx.fillText(text, 70, y, 1040);
  };
  line('FOOTBALL HEADQUARTERS', 75, 25, '#fdba74');
  line(club.slice(0, 60), 165, 58);
  line(match.won ? 'VICTORY' : 'BACK TO THE FILM ROOM', 275, 66, match.won ? '#6ee7b7' : '#fda4af');
  line(`vs ${match.opponent.slice(0, 120)}`, 335, 32, '#cbd5e1');
  line(`${match.ourScore} / 3 GAME BALLS`, 430, 48, '#fde68a');
  line('Build your club. Take the field.', 520, 28);
  line('football-headquarters.vercel.app', 573, 23, '#94a3b8');
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
}

export function ResultShare({ club, match, onClose }: { club: string; match: MatchResult; onClose: () => void }) {
  const [snapshot] = useState(() => ({ club, match: { ...match } }));
  const [card, setCard] = useState<{ url: string; file: File }>();
  const [status, setStatus] = useState('Preparing your result card…');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, url: string | undefined;
    resultCard(snapshot.club, snapshot.match).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setCard({ url, file: new File([blob], 'football-hq-result.png', { type: 'image/png' }) }); setStatus('');
    }).catch(() => { if (active) setStatus('Image export is unavailable. You can still copy the game link below.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [snapshot]);
  const share = async () => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const data = { title: 'Football Headquarters', text: `${snapshot.club}: ${snapshot.match.won ? 'victory' : 'back to the film room'} · ${snapshot.match.ourScore}/3 Game Balls`, url: GAME_URL };
      await navigator.share(navigator.canShare?.({ files: [card.file] }) ? { ...data, files: [card.file] } : data);
      setStatus('Share completed.');
    } catch (error) { setStatus(error instanceof Error && error.name === 'AbortError' ? 'Share canceled. Your card is still ready.' : 'Sharing is unavailable here. Download the image or copy the link.'); }
    finally { setBusy(false); }
  };
  const button = 'min-h-11 rounded-xl border border-slate-600 px-4 py-3 text-center text-sm font-bold text-white disabled:opacity-50';
  return <Sheet title="Your result card" subtitle="From your collected match history" onClose={onClose} maxWidth="max-w-xl">
    <div className="space-y-4 p-5">
      {card && <img src={card.url} alt={`${snapshot.club}, ${snapshot.match.won ? 'victory' : 'loss'}, ${snapshot.match.ourScore} of 3 Game Balls against ${snapshot.match.opponent}`} width={1200} height={630} className="w-full rounded-xl" />}
      <p className="text-sm text-slate-300">Preview your card before sharing. It contains your club name and match result, with no account details or reward amounts.</p>
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' && <button disabled={!card || busy} onClick={share} className={button}>Share result</button>}
        {card && <a href={card.url} download="football-hq-result.png" className={button} onClick={() => setStatus('Image download requested.')}>Download image</a>}
        <button className={button} onClick={async () => { try { await navigator.clipboard.writeText(GAME_URL); setStatus('Game link copied.'); } catch { setStatus('Copy the address from the field below.'); } }}>Copy game link</button>
      </div>
      <label className="block text-xs text-slate-400">Game link<input readOnly value={GAME_URL} onFocus={e => e.currentTarget.select()} className="mt-1 w-full rounded-lg bg-slate-800 p-3 text-sm text-white" /></label>
      <p role="status" className="text-sm text-slate-300">{status}</p>
      <button onClick={onClose} className={button}>Back to club</button>
    </div>
  </Sheet>;
}
