import { productFunnel } from '../game/productFunnel';
import React, { useEffect, useState } from 'react';

export function ClubReturnCard({ owner, eligible, onBackup }: { owner: string; eligible: boolean; onBackup: () => void }) {
  const storageKey = `fhq_return_invitation_v1:${owner}`;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(storageKey) === '1'; } catch { return false; } });
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(storageKey, '1'); } catch { /* session dismissal still works */ } };
  useEffect(() => { if (eligible && !dismissed) productFunnel('backup_prompt_viewed', {reason:'milestone'}, owner); }, [eligible, dismissed, owner]);
  if (!eligible || dismissed) return null;
  return <aside aria-label="Keep your club" className="fixed bottom-24 left-4 right-4 z-40 mx-auto max-w-sm rounded-2xl border border-orange-700 bg-slate-950 p-4 shadow-xl">
    <h2 className="font-bold text-white">You've built something worth keeping</h2>
    <p className="mt-2 text-sm text-slate-300">Link your club to an account so you can reconnect on another device. You can keep playing without doing this now.</p>
    <div className="mt-3 flex gap-2"><button onClick={() => { dismiss(); onBackup(); }} className="min-h-11 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white">Back up my club</button><button onClick={dismiss} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm text-white">Not now</button></div>
  </aside>;
}
