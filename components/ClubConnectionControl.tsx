import React, { useEffect, useState } from 'react';
import { connectionState, onConnectionChange } from '../pwa/connection';
import { applyUpdate, onUpdateAvailable, updateState } from '../pwa/register';
export function ClubConnectionControl({ blocked, protectedClub }: { blocked: boolean; protectedClub: boolean }) {
  const [connection, setConnection] = useState(connectionState);
  const [update, setUpdate] = useState(updateState);
  const [message, setMessage] = useState('');
  useEffect(() => onConnectionChange(setConnection), []);
  useEffect(() => onUpdateAvailable(setUpdate), []);
  return <section aria-label="Connection and app updates" className="space-y-3 rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
    <h3 className="font-bold text-white">Connection & updates</h3>
    <p role="status">{!connection.online && protectedClub ? 'Offline. Your saved club is available; protected games, rewards and changes wait for the server.' : connection.summary}</p>
    {update.available ? <><p>{blocked ? 'An update is ready. Finish your game and confirm pending changes before updating.' : 'An update is ready. Your saved progress will be kept.'}</p><button disabled={blocked || update.applying} onClick={() => { if (!applyUpdate()) setMessage('Update deferred. Finish current activity and try again.'); }} className="min-h-11 rounded-lg bg-blue-600 px-3 font-bold text-white disabled:opacity-50">{update.applying ? 'Updating…' : 'Update & reopen'}</button></> : <p className="text-xs text-slate-400">Updates are applied only when you choose.</p>}
    {(update.error || message) && <p role="status">{update.error || message}</p>}
  </section>;
}
