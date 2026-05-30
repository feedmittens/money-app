const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

// Simple in-process cache — avoids hammering the RSS sources on every page load
let cache = { items: [], fetchedAt: 0 };
const TTL = 60 * 60 * 1000; // 1 hour

const SOURCES = [
  { url: 'https://feeds.npr.org/1006/rss.xml',              label: 'NPR Business' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',  label: 'BBC Business' },
];

function extractTag(block, tag) {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'));
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return plain ? plain[1].replace(/<[^>]+>/g, '').trim() : '';
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
    headers: { 'User-Agent': 'BVMoney/1.5 (self-hosted personal finance)' },
    signal:  AbortSignal.timeout(8000),
  });
  return parseRss(await res.text(), label);
}

router.get('/', async (req, res) => {
  if (Date.now() - cache.fetchedAt < TTL && cache.items.length) {
    return res.json(cache.items);
  }

  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const items = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 12);

  if (items.length) {
    cache = { items, fetchedAt: Date.now() };
  }

  res.json(items);
});

module.exports = router;
