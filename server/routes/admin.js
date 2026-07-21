const router       = require('express').Router();
const pool         = require('../pg');
const requireAdmin = require('../middleware/requireAdmin');
const path         = require('path');
const fs           = require('fs');
const { spawn, execSync } = require('child_process');

const APP_DIR = path.join(__dirname, '..', '..');

router.use(requireAdmin);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/users', wrap(async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, display_name, role, status, totp_enabled, google_id IS NOT NULL AS has_google,
            created_at, last_login
     FROM users ORDER BY created_at DESC`
  );
  res.json(result.rows);
}));

router.post('/users/:id/approve', wrap(async (req, res) => {
  await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
}));

router.post('/users/:id/suspend', wrap(async (req, res) => {
  if (parseInt(req.params.id) === req.userId) {
    return res.status(400).json({ error: "You can't suspend yourself. That would be awkward." });
  }
  await pool.query(
    "UPDATE users SET status = 'suspended' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
}));

router.post('/users/:id/unsuspend', wrap(async (req, res) => {
  await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
}));

router.post('/users/:id/role', wrap(async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or user' });
  }
  if (parseInt(req.params.id) === req.userId && role !== 'admin') {
    return res.status(400).json({ error: "Can't demote yourself" });
  }
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  if (parseInt(req.params.id) === req.userId) {
    return res.status(400).json({ error: "Can't delete your own account via admin panel" });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ── App info ──────────────────────────────────────────────────────────────────
router.get('/app-info', wrap(async (_req, res) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'client', 'package.json'), 'utf8'));
  let gitCommit = 'unknown';
  let gitBranch = 'unknown';
  let gitMessage = '';
  try {
    gitCommit  = execSync('git rev-parse --short HEAD',       { cwd: APP_DIR }).toString().trim();
    gitBranch  = execSync('git rev-parse --abbrev-ref HEAD',  { cwd: APP_DIR }).toString().trim();
    gitMessage = execSync('git log -1 --format=%s',           { cwd: APP_DIR }).toString().trim();
  } catch { /* not a git repo or git unavailable — fine */ }
  res.json({ version: pkg.version, gitCommit, gitBranch, gitMessage });
}));

// ── One-click update (SSE stream) ─────────────────────────────────────────────
// Streams deploy progress as Server-Sent Events. After the build succeeds it
// restarts the systemd service with a 3s delay so the response can be sent first.
router.get('/update-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, text) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
  };

  function runCmd(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd: APP_DIR, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
      proc.stdout.on('data', d => send('log', d.toString()));
      proc.stderr.on('data', d => send('log', d.toString()));
      proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
      proc.on('error', reject);
    });
  }

  async function run() {
    try {
      send('step', '── Pulling latest code ──────────────────────────────────────');
      await runCmd('git', ['pull', '--ff-only']);

      send('step', '── Updating dependencies ────────────────────────────────────');
      // NODE_ENV=production (inherited from the server process) makes npm skip devDeps.
      // Client needs devDeps (vite, typescript, etc.) to build, so override it here.
      const buildEnv = { ...process.env, NODE_ENV: 'development' };
      await runCmd('npm', ['ci'], { cwd: path.join(APP_DIR, 'client'), env: buildEnv });
      await runCmd('npm', ['ci'], { cwd: path.join(APP_DIR, 'server') });

      send('step', '── Applying schema migrations ───────────────────────────────');
      const dbUrl  = fs.readFileSync(path.join(APP_DIR, 'server', '.env'), 'utf8')
        .split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim() || '';
      const dbName = dbUrl ? new URL(dbUrl).pathname.slice(1) : '';
      if (dbName) {
        await runCmd('su', ['-s', '/bin/bash', 'postgres', '-c',
          `psql -d '${dbName}' -f '${path.join(APP_DIR, 'server', 'schema.sql')}'`]);
        send('log', '   ✓ Schema up to date\n');
      } else {
        send('log', '   ⚠ Could not determine DB name — skipping migrations\n');
      }

      send('step', '── Rebuilding client ────────────────────────────────────────');
      await runCmd('npm', ['run', 'build'], { cwd: path.join(APP_DIR, 'client'), env: buildEnv });

      send('step', '── Updating served files ────────────────────────────────────');
      await runCmd('cp', ['-rf', 'client/dist/.', '/var/www/html/']);

      send('step', '── Reloading nginx ──────────────────────────────────────────');
      await runCmd('nginx', ['-s', 'reload']);

      send('done', '✓ Build complete — restarting API in 3 seconds…');
      res.end();

      setTimeout(() => {
        spawn('systemctl', ['restart', 'money-app-api'], { detached: true, stdio: 'ignore' }).unref();
      }, 3000);
    } catch (err) {
      send('error', `✗ ${err.message}`);
      res.end();
    }
  }

  run();
});

module.exports = router;
