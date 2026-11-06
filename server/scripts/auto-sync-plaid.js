#!/usr/bin/env node
'use strict';

// Standalone script: syncs Plaid transactions for every user with at least
// one connected institution. Run on a schedule via systemd timer (see
// money-app-infra/scripts/container-init.sh for the unit definition).
//
// Mirrors auto-post-bills.js: this is the script that was always supposed
// to exist for Plaid but never got scheduled anywhere — until now, syncing
// only happened when a user clicked "Sync All" in Settings.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../pg');
const { syncUser } = require('../lib/plaidSync');

async function run() {
  const { rows: userIds } = await pool.query(
    'SELECT DISTINCT user_id FROM plaid_items'
  );

  if (!userIds.length) {
    console.log('[plaid-sync] No Plaid connections found for any user — nothing to do.');
    await pool.end();
    return;
  }

  let totalAdded = 0;
  let failures = 0;

  for (const { user_id } of userIds) {
    try {
      const { added, institutions } = await syncUser(user_id);
      totalAdded += added;
      const detail = institutions.map(i => `${i.name}: +${i.added}`).join(', ');
      console.log(`[plaid-sync] user_id=${user_id} added=${added}${detail ? ` (${detail})` : ''}`);
    } catch (err) {
      failures++;
      console.error(`[plaid-sync] user_id=${user_id} FAILED: ${err.message}`);
    }
  }

  console.log(`[plaid-sync] Done: ${totalAdded} transaction(s) added across ${userIds.length} user(s), ${failures} failure(s)`);
  await pool.end();
  if (failures > 0) process.exitCode = 1;
}

run().catch(err => {
  console.error('[plaid-sync] Fatal:', err);
  process.exit(1);
});
