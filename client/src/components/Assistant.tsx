import { useState, useEffect, useRef } from 'react';
import { getChatHistory, sendChatMessage, clearChatHistory, getLlmSettings } from '../api';
import type { ChatMessage, LlmSettings } from '../api';
import type { View } from '../types';

interface Props {
  onNavigate: (v: View) => void;
}

export default function Assistant({ onNavigate }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const [llm, setLlm]           = useState<LlmSettings | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatHistory().then(setMessages).catch(() => {});
    getLlmSettings().then(setLlm).catch(() => setLlm(null));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setError('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }]);
    setSending(true);
    try {
      const { reply } = await sendChatMessage(text);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply, created_at: new Date().toISOString() }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    if (!confirm('Clear chat history?')) return;
    await clearChatHistory();
    setMessages([]);
  }

  const suggestions = [
    'If I max both FSAs next year, what does my monthly take-home look like?',
    'Based on my actual spending, can I afford an extra $200/month for childcare?',
    'Where am I spending more than I budgeted for over the last year?',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', maxHeight: 820 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Assistant</div>
          <div className="page-subtitle">Ask about budgets, FSA elections, and affordability — grounded in your real data</div>
        </div>
        {messages.length > 0 && <button className="btn btn-secondary btn-sm" onClick={handleClear}>Clear</button>}
      </div>

      {/* Standing privacy notice — every message sends a snapshot of real financial
          data (balances, bills, FSA elections, recent transactions) to whichever
          third-party provider is configured below. Always visible, not dismissible,
          since this is a recurring disclosure rather than a one-time confirmation. */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: 12, fontSize: 13, borderLeft: '3px solid var(--primary)' }}>
        ⚠️ <strong>Data leaves this server when you use the Assistant.</strong> Each message sends a snapshot of your
        real financial data (account balances, bills, FSA elections, and recent transactions — payee, amount,
        date, category, memo; never a bank account or routing number) to{' '}
        <strong>{llm ? (llm.provider === 'custom' ? (llm.base_url || 'your custom endpoint') : llm.provider) : 'your configured AI provider'}</strong>.
        That data is subject to that provider's own privacy and security policies, not Tally's — review them before using this feature with sensitive payees or memos you'd rather not share.
      </div>

      {llm?.has_key === false && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 12, fontSize: 13 }}>
          No AI provider configured yet.{' '}
          <a href="#" onClick={e => { e.preventDefault(); onNavigate({ type: 'settings' }); }}>
            Set one up in Settings → AI Assistant
          </a>.
        </div>
      )}

      <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            <p style={{ marginBottom: 10 }}>Try asking:</p>
            {suggestions.map(s => (
              <div key={s}
                style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', marginBottom: 6, cursor: 'pointer' }}
                onClick={() => setInput(s)}>
                {s}
              </div>
            ))}
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            background: m.role === 'user' ? 'var(--primary)' : 'var(--surface-2)',
            color: m.role === 'user' ? '#fff' : 'inherit',
            padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 14, whiteSpace: 'pre-wrap',
          }}>
            {m.content}
          </div>
        ))}
        {sending && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12, background: '#fee2e2', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          placeholder="Ask about your budget, FSA, or a what-if scenario…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
