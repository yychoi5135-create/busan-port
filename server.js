const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeTerminal } = require('./scrapers/scraper');
const TERMINALS = require('./scrapers/terminals');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const cache = new Map();
const CACHE_TTL = 60 * 1000;

function getCached(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(id); return null; }
  return entry.data;
}
function setCache(id, data) {
  cache.set(id, { data, ts: Date.now() });
}

async function fetchTerminal(terminal) {
  const cached = getCached(terminal.id);
  if (cached) { console.log(`[Cache] ${terminal.name}`); return { ...cached, fromCache: true }; }

  console.log(`[Fetch] ${terminal.name}`);
  const start = Date.now();

  if (!terminal.url) {
    return { id: terminal.id, status: 'nourl', vessels: [], elapsed: 0 };
  }

  try {
    const vessels = await scrapeTerminal(terminal);
    const elapsed = Date.now() - start;
    const result = {
      id: terminal.id,
      status: vessels.length > 0 ? 'live' : 'empty',
      vessels, elapsed, fromCache: false,
    };
    setCache(terminal.id, result);
    console.log(`[Done] ${terminal.name}: ${vessels.length}척 (${elapsed}ms)`);
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[Error] ${terminal.name}: ${err.message}`);
    return { id: terminal.id, status: 'fail', error: err.message, vessels: [], elapsed, fromCache: false };
  }
}

app.get('/api/terminals', (req, res) => {
  res.json({ ok: true, terminals: TERMINALS.map(({ id, name, full, pier, color, direct }) => ({ id, name, full, pier, color, direct })) });
});

app.get('/api/terminal/:id', async (req, res) => {
  const terminal = TERMINALS.find(t => t.id === req.params.id);
  if (!terminal) return res.status(404).json({ ok: false, error: '없는 터미널' });
  const result = await fetchTerminal(terminal);
  res.json({ ok: true, ...result });
});

app.get('/api/all', async (req, res) => {
  console.log('\n[All] 전체 스크래핑 시작');
  const results = await Promise.allSettled(TERMINALS.map(t => fetchTerminal(t)));
  const data = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { id: TERMINALS[i].id, status: 'fail', vessels: [] }
  );
  const liveCount = data.filter(d => d.status === 'live').length;
  const shipTotal = data.reduce((s, d) => s + (d.vessels?.length || 0), 0);
  res.json({ ok: true, data, liveCount, shipTotal, timestamp: new Date().toISOString() });
});

app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ ok: true, message: '캐시 초기화 완료' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), cacheSize: cache.size });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n⚓ 부산 신항 선석표 서버 시작: http://localhost:${PORT}\n`);
});