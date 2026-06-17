'use strict';

const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const pool        = require('../pg');

router.use(requireAuth);

const TTL = 60 * 60 * 1000; // 1 hour

const DEFAULT_FEEDS = [
  { url: 'https://feeds.npr.org/1006/rss.xml',             label: 'NPR Business' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', label: 'BBC Business' },
];

// Per-user in-process cache — avoids hammering RSS sources on every page load
const userCaches = new Map();

const getCache   = (uid) => userCaches.get(uid) || { items: [], fetchedAt: 0 };
const setCache   = (uid, data) => userCaches.set(uid, data);
const clearCache = (uid) => userCaches.delete(uid);

function decodeEntities(str) {
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g,  "'")
    .replace(/&#(\d+);/g,         (_, n)   => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h)   => String.fromCharCode(parseInt(h, 16)));
}

function extractTag(block, tag) {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'));
  if (cdata) return decodeEntities(cdata[1].trim());
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return plain ? decodeEntities(plain[1].replace(/<[^>]+>/g, '').trim()) : '';
}

function parseRss(xml, sourceLabel) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.slice(0, 8).map(block => {
    const linkMatch = block.match(/<link>([^<\s]+)<\/link>/i)
                   || block.match(/<link[^>]+href="([^"]+)"/i);
    return {
      title:       extractTag(block, 'title'),
      link:        linkMatch?.[1]?.trim() || '',
      description: extractTag(block, 'description').slice(0, 280),
      pubDate:     extractTag(block, 'pubDate'),
      source:      sourceLabel,
    };
  }).filter(i => i.title && i.link);
}

async function fetchSource({ url, label }) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Tally/1.15 (self-hosted personal finance)' },
    signal:  AbortSignal.timeout(8000),
  });
  return parseRss(await res.text(), label);
}

async function getUserFeeds(uid) {
  const { rows } = await pool.query(
    'SELECT id, url, label FROM news_feeds WHERE user_id=$1 ORDER BY id', [uid]
  );
  if (rows.length) return rows;
  // First time — seed defaults
  for (const { url, label } of DEFAULT_FEEDS) {
    await pool.query(
      'INSERT INTO news_feeds (user_id, url, label) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [uid, url, label]
    );
  }
  const { rows: seeded } = await pool.query(
    'SELECT id, url, label FROM news_feeds WHERE user_id=$1 ORDER BY id', [uid]
  );
  return seeded;
}

// GET /api/news — fetch items from user's configured feeds
router.get('/', async (req, res) => {
  const uid = req.userId;
  const c = getCache(uid);
  if (Date.now() - c.fetchedAt < TTL && c.items.length) {
    return res.json({ items: c.items, fetchedAt: c.fetchedAt });
  }

  const feeds   = await getUserFeeds(uid);
  const results = await Promise.allSettled(feeds.map(fetchSource));
  const items   = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 16);

  if (items.length) setCache(uid, { items, fetchedAt: Date.now() });
  const final = getCache(uid);
  res.json({ items: final.items, fetchedAt: final.fetchedAt });
});

// GET /api/news/feeds — list user's configured feed sources
router.get('/feeds', async (req, res) => {
  const feeds = await getUserFeeds(req.userId);
  res.json(feeds);
});

// POST /api/news/feeds — add a feed source
router.post('/feeds', async (req, res) => {
  const { url, label } = req.body || {};
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'A valid http(s) URL is required' });
  if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO news_feeds (user_id, url, label) VALUES ($1,$2,$3) RETURNING id, url, label',
      [req.userId, url.trim(), label.trim()]
    );
    clearCache(req.userId);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That feed is already in your list' });
    throw err;
  }
});

// DELETE /api/news/feeds/:id — remove a feed source
router.delete('/feeds/:id', async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM news_feeds WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  clearCache(req.userId);
  res.json({ ok: true });
});

module.exports = router;
