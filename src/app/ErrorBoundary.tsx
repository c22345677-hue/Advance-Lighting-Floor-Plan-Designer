// If the app crashes, show what went wrong and a way out, instead of a blank page. The saved
// project can be downloaded first, or set aside so the app starts from the sample.
import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /** Copy the saved data aside (not deleted) and start fresh. */
  private startFresh = () => {
    try {
      const keep: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('lfpd.')) keep[k] = localStorage.getItem(k);
      }
      localStorage.setItem(`lfpdBackup.${Date.now()}`, JSON.stringify(keep));
      for (const k of Object.keys(keep)) localStorage.removeItem(k);
    } catch {
      // Storage blocked: nothing saved to set aside.
    }
    location.reload();
  };

  private copy = () => {
    const e = this.state.error;
    navigator.clipboard?.writeText(`${e?.message}\n${e?.stack ?? ''}`).catch(() => {});
  };

  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>The app hit an error. Your work is still saved on this device.</p>
        <pre>{`${e.message}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`}</pre>
        <div className="crash-actions">
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={this.copy}>
            Copy error
          </button>
          <button className="btn danger" onClick={this.startFresh}>
            Start fresh (keeps a backup)
          </button>
        </div>
      </div>
    );
  }
}
