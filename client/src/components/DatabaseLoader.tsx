import { useState } from 'react';
import { openFile, createNew } from '../database';

interface Props {
  onLoaded: () => void;
}

export default function DatabaseLoader({ onLoaded }: Props) {
  const [loading, setLoading] = useState<'open' | 'new' | null>(null);
  const [error, setError] = useState('');

  async function handleOpen() {
    setError('');
    setLoading('open');
    try {
      const ok = await openFile();
      if (ok) onLoaded();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Could not open file');
    } finally {
      setLoading(null);
    }
  }

  async function handleNew() {
    setError('');
    setLoading('new');
    try {
      await createNew();
      onLoaded();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Could not create database');
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;

  return (
    <div className="db-loader-overlay">
      <div className="db-loader-card">
        <div className="db-loader-icon">💵</div>
        <h1 className="db-loader-title">Money</h1>
        <p className="db-loader-subtitle">Your financial data stays on your computer.<br />Nothing is sent to any server.</p>

        <div className="db-loader-buttons">
          <button
            className="db-loader-btn db-loader-btn-primary"
            onClick={handleOpen}
            disabled={busy}
          >
            {loading === 'open' ? 'Opening…' : '📂 Open my finances file'}
          </button>
          <div className="db-loader-or">or</div>
          <button
            className="db-loader-btn db-loader-btn-secondary"
            onClick={handleNew}
            disabled={busy}
          >
            {loading === 'new' ? 'Creating…' : '✨ Start fresh with sample data'}
          </button>
        </div>

        {error && (
          <div className="db-loader-error">{error}</div>
        )}

        <p className="db-loader-hint">
          Opens a <code>.db</code> file from your PC · Changes auto-save back to that file
        </p>
      </div>
    </div>
  );
}
