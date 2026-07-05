import React from 'react';

// Crash safety: one render error must never mean a blank screen. The save lives in
// localStorage and autosaves every 2s, so a reload always recovers the player.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[FHQ] render crash:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="text-5xl mb-4">🏈</div>
          <h1 className="text-2xl font-bold text-white mb-2">Timeout on the field</h1>
          <p className="text-slate-400 text-sm mb-2">
            Something went wrong on our side. <span className="text-slate-200 font-bold">Your save is safe</span> — a reload puts you right back in the game.
          </p>
          <p className="text-slate-600 text-xs font-mono mb-6 break-all">{String(this.state.error)}</p>
          <button
            onClick={() => location.reload()}
            className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold transition-colors"
          >
            Back to the game
          </button>
        </div>
      </div>
    );
  }
}
