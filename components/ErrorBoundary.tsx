import React from 'react';
import { SaveLoadError, parseSavedClub } from '../game/saveValidation';

interface State { error: Error | null; confirmFresh: boolean; message: string; }
const SAVE = 'fhq_save_v1';

/** A failed boot never mounts the game loop or autosave over unreadable progress. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, confirmFresh: false, message: '' };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[FHQ] render crash:', error, info.componentStack); }
  download = () => {
    try {
      const raw = localStorage.getItem(SAVE);
      if (!raw) throw new Error('No local save');
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'football-hq-recovery.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.setState({ message: 'Original save downloaded. Keep it for recovery.' });
    } catch { this.setState({ message: 'The browser could not read the save file.' }); }
  };
  restore = () => {
    try {
      const backup = localStorage.getItem('fhq_save_backup_boot');
      if (!backup) throw new Error('No backup');
      parseSavedClub(backup);
      localStorage.setItem('fhq_save_recovery', localStorage.getItem(SAVE) ?? '');
      localStorage.setItem(SAVE, backup);
      localStorage.setItem('fhq_saved_at', String(Date.now()));
      location.reload();
    } catch { this.setState({ message: 'A readable backup could not be restored. Download the original save before starting a new club.' }); }
  };
  startFresh = () => {
    if (!this.state.confirmFresh) { this.setState({ confirmFresh: true }); return; }
    try {
      localStorage.setItem('fhq_save_recovery', localStorage.getItem(SAVE) ?? '');
      localStorage.removeItem(SAVE); localStorage.removeItem('fhq_tutorial_done_v1');
      localStorage.setItem('fhq_saved_at', String(Date.now())); location.reload();
    } catch { this.setState({ message: 'The original save could not be archived. Download it first and free some browser storage.' }); }
  };
  render() {
    if (!this.state.error) return this.props.children;
    const recovery = this.state.error instanceof SaveLoadError;
    return <div className="fixed inset-0 overflow-y-auto bg-slate-950 flex items-center justify-center p-6 text-white">
      <section className="max-w-md text-center" aria-labelledby="recovery-title">
        <img src="/assets/brand/app-icon.webp" width="72" height="72" alt="" className="mx-auto rounded-2xl mb-5" />
        <h1 id="recovery-title" className="text-2xl font-bold mb-3">{recovery ? 'Let’s recover your club' : 'Timeout on the field'}</h1>
        <p className="text-slate-300 text-base mb-5">{recovery ? 'Your saved club could not be read. Autosave has stopped, and your original file has not been replaced. You can download it or restore the last readable backup.' : 'Something interrupted the game. Reload to try again, or download the last saved progress.'}</p>
        <div className="grid gap-3">
          <button onClick={recovery ? this.restore : () => location.reload()} className="px-5 py-3 rounded-xl bg-orange-500 text-slate-950 font-bold">{recovery ? 'Restore last readable backup' : 'Reload game'}</button>
          <button onClick={this.download} className="px-5 py-3 rounded-xl border border-slate-600 font-bold">Download original save</button>
          {recovery && <button onClick={this.startFresh} className="px-5 py-3 rounded-xl text-slate-300 border border-slate-700">{this.state.confirmFresh ? 'Confirm: archive this save and start over' : 'Start a new club…'}</button>}
          {this.state.confirmFresh && <button onClick={() => this.setState({ confirmFresh: false })} className="py-2 text-slate-300">Cancel</button>}
        </div>
        {this.state.message && <p role="status" className="mt-4 text-sm text-amber-200">{this.state.message}</p>}
      </section>
    </div>;
  }
}
