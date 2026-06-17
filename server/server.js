require('dotenv').config();

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const express        = require('express');
const session        = require('express-session');
const PgSession      = require('connect-pg-simple')(session);
const pool           = require('./pg');
const { router: authRouter, passport } = require('./routes/auth');

const app = express();

// Trust nginx's X-Forwarded-Proto so express-session sets Secure cookies correctly
app.set('trust proxy', 1);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  store: new PgSession({
    pool,
    createTableIfMissing: true,
  }),
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
}));

// ── Passport (Google OAuth only — local auth is handled manually) ─────────────
app.use(passport.initialize());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRouter);
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/accounts',     require('./routes/accounts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories',   require('./routes/categories'));
app.use('/api/bills',        require('./routes/bills'));
app.use('/api/budgets',      require('./routes/budgets'));
app.use('/api/networth',     require('./routes/networth'));
app.use('/api/forecast',     require('./routes/forecast'));
app.use('/api/news',         require('./routes/news'));
app.use('/api/import',       require('./routes/import'));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  // Return a generic message — DB errors can leak schema details (table names,
  // constraint names, duplicate key values) to the client.
  res.status(500).json({ error: 'An unexpected error occurred' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Tally API running on http://localhost:${PORT}`));
