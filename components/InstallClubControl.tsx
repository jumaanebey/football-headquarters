import React, { useEffect, useState } from 'react';
import { installSupport, onInstallSupportChange, promptInstall } from '../pwa/install';

export function useClubInstall() {
  const [support, setSupport] = useState(installSupport);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    setSupport(installSupport());
    return onInstallSupportChange(setSupport);
  }, []);
  const install = async () => {
    if (busy) return;
    if (!support.canPrompt) { setStatus(support.manualInstructions ?? 'Use your browser menu to bookmark this game.'); return; }
    setBusy(true);
    try {
      const outcome = await promptInstall();
      setStatus(outcome === 'accepted' ? 'Installation requested.' : outcome === 'dismissed' ? 'Installation dismissed. You can keep playing here.' : 'Installation is unavailable in this browser.');
    } finally { setBusy(false); }
  };
  return { available: support.installed || support.canPrompt || !!support.manualInstructions, installed: support.installed, busy, status, install };
}
export function InstallClubControl({ install }: { install: ReturnType<typeof useClubInstall> }) {
  if (!install.available) return null;
  return <section aria-label="Home screen access" className="space-y-2 rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
    <h3 className="font-bold text-white">Keep the game handy</h3>
    {install.installed ? <p>You're playing from the installed app.</p> : <button disabled={install.busy} onClick={install.install} className="min-h-11 rounded-lg border border-slate-500 px-3 font-bold text-white">Add game to home screen</button>}
    <p className="text-xs">Link your club to reconnect on another device. Protected changes still need a server connection.</p>
    <p role="status">{install.status}</p>
  </section>;
}
