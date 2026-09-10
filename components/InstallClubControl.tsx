import React, { useEffect, useState } from 'react';
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
/** UI integration boundary: Claude owns the manifest, worker and update policy. */
export function useClubInstall() {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)');
    const update = () => setInstalled(mode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    update(); setAvailable(!!document.querySelector('link[rel="manifest"]'));
    const receive = (event: Event) => { event.preventDefault(); setOffer(event as InstallEvent); };
    const complete = () => { setInstalled(true); setOffer(null); setStatus('Added to your home screen.'); };
    window.addEventListener('beforeinstallprompt', receive); window.addEventListener('appinstalled', complete); mode.addEventListener('change', update);
    return () => { window.removeEventListener('beforeinstallprompt', receive); window.removeEventListener('appinstalled', complete); mode.removeEventListener('change', update); };
  }, []);
  const install = async () => {
    if (busy) return;
    if (!offer) {
      const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setStatus(apple ? 'Open this game in Safari. Use Share, then Add to Home Screen. If that action is hidden, choose Edit Actions in the Share menu.' : 'Open your browser menu and look for Install app or Add to Home screen. If neither is offered, bookmark this game to return.');
      return;
    }
    setBusy(true);
    try { await offer.prompt(); const choice = await offer.userChoice; setStatus(choice.outcome === 'accepted' ? 'Installation requested.' : 'Installation dismissed. You can keep playing here.'); }
    catch { setStatus('Installation could not open. Use your browser menu to install or bookmark the game.'); }
    finally { setOffer(null); setBusy(false); }
  };
  return { available, installed, busy, status, install };
}
export function InstallClubControl({ install }: { install: ReturnType<typeof useClubInstall> }) {
  if (!install.available) return null;
  return <section aria-label="Home screen access" className="space-y-2 rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
    <h3 className="font-bold text-white">Keep the game handy</h3>
    {install.installed ? <p>You're playing from the installed app.</p> : <button disabled={install.busy} onClick={install.install} className="min-h-11 rounded-lg border border-slate-500 px-3 font-bold text-white">Add game to home screen</button>}
    <p className="text-xs">Installation is a shortcut, not a backup. Link your club to reconnect on another device. Protected changes still need a server connection.</p>
    <p role="status">{install.status}</p>
  </section>;
}
