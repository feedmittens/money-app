import { useState, useRef } from 'react';
import { importData } from '../database';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

interface PreviewAccount {
  name: string;
  type: string;
  count: number;
  sample: Array<{ date: string; payee: string; amount: number; memo?: string; category?: string }>;
}

interface ImportStats {
  accounts: number;
  transactions: number;
  skipped: number;
  categories: number;
}

interface Props {
  onImportDone: () => void;
}

export default function ImportData({ onImportDone }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<PreviewAccount[] | null>(null);
  const [format, setFormat] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportStats | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      setContent(text);
      setFilename(file.name);
      setResult(null);
      setError('');

      // Auto-preview
      setLoading(true);
      try {
        const res = await fetch('/api/import/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text, filename: file.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setPreview(data.summary);
        setFormat(data.format);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Parse failed');
        setPreview(null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  async function handleImport() {
    if (!content) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const stats = importData(data.accounts);
      setResult(stats);
      setPreview(null);
      setContent('');
      setFilename('');
      onImportDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setContent('');
    setFilename('');
    setPreview(null);
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const totalTxns = preview?.reduce((s, a) => s + a.count, 0) ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Import Data</div>
          <div className="page-subtitle">Import from Microsoft Money, Quicken, or bank CSV exports</div>
        </div>
      </div>

      {/* Format guide */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>How to export from Microsoft Money</div>
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <li>Open Microsoft Money</li>
          <li>Go to <strong style={{ color: 'var(--text)' }}>File → Export → To Quicken</strong></li>
          <li>Save the file as a <strong style={{ color: 'var(--text)' }}>.qif</strong> file</li>
          <li>Drag and drop the file below (or click to browse)</li>
        </ol>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { ext: '.qif', label: 'QIF', note: 'Microsoft Money, Quicken' },
            { ext: '.ofx / .qfx', label: 'OFX / QFX', note: 'Bank direct downloads' },
            { ext: '.csv', label: 'CSV', note: 'Spreadsheet exports' },
          ].map(f => (
            <div key={f.ext} style={{
              padding: '8px 14px', borderRadius: 'var(--radius)',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              fontSize: 12,
            }}>
              <strong>{f.label}</strong> <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.ext}</code>
              <br /><span style={{ color: 'var(--text-muted)' }}>{f.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      {!preview && !result && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: '40px 20px',
            textAlign: 'center',
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-2)'}`,
            background: dragOver ? '#eff6ff' : 'var(--surface)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {loading ? 'Parsing file…' : 'Drop your file here or click to browse'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Supports .qif, .ofx, .qfx, .ofc, .csv
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".qif,.ofx,.qfx,.ofc,.csv,.txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius)',
          background: '#fee2e2',
          color: 'var(--danger)',
          marginBottom: 16,
          fontSize: 13,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>⚠️ {error}</span>
          <button className="btn btn-ghost btn-sm" onClick={reset}>Dismiss</button>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div>
                <span className="card-title">Preview: {filename}</span>
                <div className="card-subtitle">
                  Format detected: <strong>{format.toUpperCase()}</strong> ·
                  {' '}{preview.length} account{preview.length !== 1 ? 's' : ''} ·
                  {' '}{totalTxns} transaction{totalTxns !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={reset}>Choose Different File</button>
                <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
                  {loading ? 'Importing…' : `Import ${totalTxns} Transactions`}
                </button>
              </div>
            </div>

            {preview.map((acct, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '12px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>{acct.name || 'Unnamed Account'}</span>
                  <span style={{
                    padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: 'var(--surface-2)', color: 'var(--text-muted)', textTransform: 'capitalize',
                  }}>{acct.type}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {acct.count} transaction{acct.count !== 1 ? 's' : ''}
                  </span>
                </div>
                {acct.sample.length > 0 && (
                  <table className="register-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Payee</th>
                        <th>Category</th>
                        <th>Memo</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acct.sample.map((t, j) => (
                        <tr key={j}>
                          <td className="text-muted">{t.date}</td>
                          <td>{t.payee}</td>
                          <td className="text-muted">{t.category || '—'}</td>
                          <td className="text-muted" style={{ fontSize: 11 }}>{t.memo || '—'}</td>
                          <td className={`amount-col ${t.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                            {fmt(t.amount)}
                          </td>
                        </tr>
                      ))}
                      {acct.count > acct.sample.length && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '8px', fontStyle: 'italic', fontSize: 11 }}>
                            + {acct.count - acct.sample.length} more transactions
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Import Complete</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 400 }}>
            {[
              { label: 'Transactions imported', value: result.transactions },
              { label: 'Duplicate / skipped', value: result.skipped },
              { label: 'Accounts created', value: result.accounts },
              { label: 'New categories', value: result.categories },
            ].map(r => (
              <div key={r.label} style={{
                padding: '12px 16px', background: 'var(--surface-2)',
                borderRadius: 'var(--radius)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{r.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r.label}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={reset}>
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
