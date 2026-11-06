const router        = require('express').Router();
const rateLimit     = require('express-rate-limit');
const pool          = require('../pg');
const requireAuth   = require('../middleware/requireAuth');
const { encrypt, decrypt } = require('../lib/crypto');
const { buildContext }     = require('../lib/chatContext');

router.use(requireAuth);

// Each message is a real paid call to a third-party LLM API — the generic
// apiLimiter in server.js (500 req / 15 min) is far too loose to stop a
// runaway frontend loop or a stuck retry from burning real money on the
// user's own key. Keyed by user, not IP, since requests may share a NAT/
// Tailscale exit IP.
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.userId),
  message: { error: 'Too many assistant messages — please wait before sending more.' },
});

const uid  = req => req.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const DEFAULT_MODELS = {
  anthropic:  'claude-sonnet-4-5',
  openai:     'gpt-5',
  openrouter: 'anthropic/claude-sonnet-4-5',
  gemini:     'gemini-2.5-pro',
  custom:     '',
};

// ── Settings ─────────────────────────────────────────────────────────────────────

router.get('/settings', wrap(async (req, res) => {
  const row = (await pool.query(
    'SELECT provider, model, base_url, api_key_enc FROM llm_settings WHERE user_id=$1', [uid(req)]
  )).rows[0];
  if (!row) return res.json({ provider: 'anthropic', model: DEFAULT_MODELS.anthropic, base_url: '', has_key: false });
  res.json({
    provider: row.provider,
    model:    row.model || DEFAULT_MODELS[row.provider] || '',
    base_url: row.base_url || '',
    has_key:  !!row.api_key_enc,
  });
}));

router.put('/settings', wrap(async (req, res) => {
  const { provider, model, base_url, api_key } = req.body;
  if (!['anthropic', 'openai', 'openrouter', 'gemini', 'custom'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  const existing = (await pool.query('SELECT api_key_enc FROM llm_settings WHERE user_id=$1', [uid(req)])).rows[0];
  // Only overwrite the stored key if a new one was actually provided —
  // leaves it untouched if the field was left blank on an edit.
  const keyEnc = api_key ? encrypt(api_key) : (existing?.api_key_enc ?? null);

  await pool.query(`
    INSERT INTO llm_settings (user_id, provider, model, base_url, api_key_enc, updated_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      provider=$2, model=$3, base_url=$4, api_key_enc=$5, updated_at=NOW()
  `, [uid(req), provider, model || null, base_url || null, keyEnc]);

  res.json({ provider, model: model || DEFAULT_MODELS[provider], base_url: base_url || '', has_key: !!keyEnc });
}));

router.delete('/settings/key', wrap(async (req, res) => {
  await pool.query('UPDATE llm_settings SET api_key_enc=NULL, updated_at=NOW() WHERE user_id=$1', [uid(req)]);
  res.json({ ok: true });
}));

// ── Provider calls ───────────────────────────────────────────────────────────────

async function callAnthropic(apiKey, model, systemPrompt, messages) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: model || DEFAULT_MODELS.anthropic,
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return response.content.map(b => b.text || '').join('');
}

// Works for openai, openrouter, and any OpenAI-compatible custom endpoint
async function callOpenAICompatible(apiKey, model, baseUrl, systemPrompt, messages) {
  const url = (baseUrl || (
    { openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1' }
  )[model.provider]) + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.name,
      max_tokens: 1500,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!resp.ok) throw new Error(`Provider error (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(apiKey, model, systemPrompt, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODELS.gemini}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    }),
  });
  if (!resp.ok) throw new Error(`Gemini error (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

const SYSTEM_PROMPT_PREFIX = `You are a financial planning assistant embedded in Tally, the user's personal finance app.
You are given a JSON snapshot of their REAL financial data below — accounts, recurring bills/income,
FSA elections, their actual last-12-months spending by category, AND individual recent transactions
(payee, amount, date, category, memo, account label — never a real bank account or routing number,
since this app never stores those). Use ONLY this data for numbers; never invent balances, bills,
spending figures, or transactions. If something isn't in the data (e.g. a transaction older than the
window provided), say so plainly and suggest checking Search or Reports in the app.

Use recent_transactions for payee/category-level analysis: spotting miscategorized transactions,
identifying recurring charges that aren't yet set up as Bills, or breaking down a category's spending
by individual payee. Use spending_last_12mo_by_category for longer-run averages and trend questions
that go beyond the recent_transactions window.

When asked "can I afford X" or to model a scenario (e.g. new FSA elections reducing take-home pay),
reason using: current account balances + recurring income/expenses + actual spending averages
(not just the written budget, since real spending often differs from it). Call out variance between
budgeted and actual spending when relevant. Be direct about affordability — don't hedge if the math
is clear. You cannot make changes to their data; you only advise and project.

FINANCIAL SNAPSHOT (JSON):
`;

router.post('/chat', chatLimiter, wrap(async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const settings = (await pool.query('SELECT * FROM llm_settings WHERE user_id=$1', [uid(req)])).rows[0];
  if (!settings || !settings.api_key_enc) {
    return res.status(400).json({ error: 'No AI provider configured. Add an API key in Settings → AI Assistant.' });
  }
  const apiKey = decrypt(settings.api_key_enc);
  const provider = settings.provider;
  const model = settings.model || DEFAULT_MODELS[provider];

  const context = await buildContext(uid(req));
  const systemPrompt = SYSTEM_PROMPT_PREFIX + JSON.stringify(context, null, 2);

  const history = (await pool.query(
    'SELECT role, content FROM chat_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [uid(req)]
  )).rows.reverse();
  const messages = [...history, { role: 'user', content: message }];

  let reply;
  try {
    if (provider === 'anthropic') {
      reply = await callAnthropic(apiKey, model, systemPrompt, messages);
    } else if (provider === 'gemini') {
      reply = await callGemini(apiKey, model, systemPrompt, messages);
    } else {
      reply = await callOpenAICompatible(apiKey, { provider, name: model }, settings.base_url, systemPrompt, messages);
    }
  } catch (e) {
    return res.status(502).json({ error: `AI provider call failed: ${e.message}` });
  }

  await pool.query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1,$2,$3)', [uid(req), 'user', message]);
  await pool.query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1,$2,$3)', [uid(req), 'assistant', reply]);

  res.json({ reply });
}));

router.get('/chat/history', wrap(async (req, res) => {
  const rows = (await pool.query(
    'SELECT id, role, content, created_at FROM chat_messages WHERE user_id=$1 ORDER BY created_at ASC LIMIT 200', [uid(req)]
  )).rows;
  res.json(rows);
}));

router.delete('/chat/history', wrap(async (req, res) => {
  await pool.query('DELETE FROM chat_messages WHERE user_id=$1', [uid(req)]);
  res.json({ ok: true });
}));

module.exports = router;
