import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken screen never takes down the app.
 * Data is already persisted on every edit, so reloading is always safe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SCENEFORGE screen error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center" role="alert">
        <div className="eyebrow mb-3">Cut</div>
        <h1 className="display text-[34px] text-ink">{isChunk ? 'SCENEFORGE was updated' : 'This screen hit a problem'}</h1>
        <p className="mt-2 max-w-md text-[13.5px] text-muted">
          {isChunk
            ? 'A newer version is available. Reload to continue — your work is saved.'
            : 'Your work is saved on this device. Reloading usually fixes this.'}
        </p>
        {!isChunk && <pre className="mt-4 max-w-xl overflow-x-auto rounded-sm border border-line bg-surface px-3 py-2 text-left font-mono text-[11.5px] text-faint">{this.state.error.message}</pre>}
        <div className="mt-6 flex gap-2">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              window.location.hash = '#/';
              this.setState({ error: null });
            }}
          >
            Back to studio
          </button>
        </div>
      </div>
    );
  }
}
