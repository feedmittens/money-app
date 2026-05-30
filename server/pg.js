const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[pg] Unexpected error on idle client:', err.message);
});

module.exports = pool;
