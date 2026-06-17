#!/usr/bin/env node
'use strict';

// Standalone script: auto-post bills that are due.
// Run daily via systemd timer or cron.
// Bills must have auto_post=TRUE and account_id set to be eligible.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../pg');

function parseDays(raw) {
  if (!raw) return [];
  return raw.split(',').map(d => parseInt(d.trim(), 10)).filter(d => d >= 1 && d <= 31).sort((a, b) => a - b);
}

function isBillDue(bill) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastPaid = bill.last_paid ? new Date(bill.last_paid) : null;
  if (lastPaid) lastPaid.setHours(0, 0, 0, 0);

  switch (bill.frequency) {
    case 'monthly': {
      const dueDate = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
      if (today < dueDate) return false;
      return !lastPaid || lastPaid < dueDate;
    }
    case 'semimonthly': {
      const day2 = bill.due_day_2 ?? 15;
      const candidates = [bill.due_day, day2]
        .map(d => new Date(today.getFullYear(), today.getMonth(), d))
        .filter(d => d <= today)
        .sort((a, b) => b - a);
      if (!candidates.length) return false;
      return !lastPaid || lastPaid < candidates[0];
    }
    case 'weekly': {
      if (!lastPaid) return true;
      const next = new Date(lastPaid);
      next.setDate(next.getDate() + 7);
      return today >= next;
    }
    case 'biweekly': {
      if (!lastPaid) return true;
      const next = new Date(lastPaid);
      next.setDate(next.getDate() + 14);
      return today >= next;
    }
    case 'quarterly': {
      if (!lastPaid) {
        const qStart = [0, 3, 6, 9][Math.floor(today.getMonth() / 3)];
        const dueDate = new Date(today.getFullYear(), qStart, bill.due_day);
        return today >= dueDate;
      }
      const next = new Date(lastPaid);
      next.setMonth(next.getMonth() + 3);
      return today >= next;
    }
    case 'annual': {
      const dueDate = new Date(today.getFullYear(), 0, bill.due_day);
      if (today < dueDate) return false;
      return !lastPaid || lastPaid < dueDate;
    }
    case 'custom': {
      const days = parseDays(bill.custom_days);
      if (!days.length) return false;
      const pastDates = days
        .map(d => new Date(today.getFullYear(), today.getMonth(), d))
        .filter(d => d <= today)
        .sort((a, b) => b - a);
      if (!pastDates.length) return false;
      return !lastPaid || lastPaid < pastDates[0];
    }
    default:
      return false;
  }
}

async function run() {
  let posted = 0;
  let skipped = 0;

  const { rows: bills } = await pool.query(`
    SELECT * FROM bills
    WHERE is_active = TRUE AND auto_post = TRUE AND account_id IS NOT NULL
  `);

  for (const bill of bills) {
    if (!isBillDue(bill)) {
      skipped++;
      continue;
    }

    const today = new Date().toISOString().slice(0, 10);
    await pool.query(`
      INSERT INTO transactions (user_id, account_id, date, payee, category_id, amount, memo, cleared, bill_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
    `, [bill.user_id, bill.account_id, today, bill.name, bill.category_id, bill.amount, 'Auto-posted bill', bill.id]);

    await pool.query('UPDATE bills SET last_paid=$1 WHERE id=$2', [today, bill.id]);

    console.log(`[auto-post] Posted: "${bill.name}" user_id=${bill.user_id} amount=${bill.amount}`);
    posted++;
  }

  console.log(`[auto-post] Done: ${posted} posted, ${skipped} not yet due`);
  await pool.end();
}

run().catch(err => {
  console.error('[auto-post] Fatal:', err);
  process.exit(1);
});
