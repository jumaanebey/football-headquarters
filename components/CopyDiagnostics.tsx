import { useState } from 'react';

export function CopyDiagnostics({ report }: { report: () => string }) {
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="mt-3 space-y-2">
    <p>Support report includes connection status, build, outcome codes and shortened identifiers. It excludes your club name, save, match film and tokens.</p>
    <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
      setBusy(true); setMessage(''); setFallback('');
      try {
        const text = report();
        try {
          await navigator.clipboard.writeText(text);
          setMessage('Diagnostics copied. Paste them into your support message.');
        } catch {
          setFallback(text);
          setMessage('Clipboard unavailable. Select and copy the report below.');
        }
      } catch { setMessage('Could not prepare diagnostics. Close Settings and try again.'); }
      finally { setBusy(false); }
    }}>Copy diagnostics</button>
    {message && <p role="status">{message}</p>}
    {fallback && <textarea aria-label="Support diagnostics report" readOnly value={fallback} onFocus={event => event.currentTarget.select()} className="min-h-40 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-xs text-white" />}
  </div>;
}
