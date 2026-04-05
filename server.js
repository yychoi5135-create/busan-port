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
function getCached(k) {
  const e = cache.get(k);
    if (!e) return null;
      if (Date.now() - e.ts > CACHE_TTL) { cache.delete(k); return null; }
        return e.data;
        }
        function setCache(k, d) { cache.set(k, { data: d, ts: Date.now() }); }

        async function fetchTerminal(terminal) {
          const cached = getCached(terminal.id);
            if (cached) return { ...cached, fromCache: true };

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

                                                                                      app.get('/api/all', async (req, res) => {
                                                                                        const results = await Promise.allSettled(TERMINALS.map(t => fetchTerminal(t)));
                                                                                          const data = results.map((r, i) =>
                                                                                              r.status === 'fulfilled' ? r.value : { id: TERMINALS[i].id, status: 'fail', vessels: [] }
                                                                                                );
                                                                                                  const totalVessels = data.reduce((s, d) => s + (d.vessels?.length || 0), 0);
                                                                                                    res.json({ ok: true, data, totalVessels, timestamp: new Date().toISOString() });
                                                                                                    });

                                                                                                    app.get('/api/terminal/:id', async (req, res) => {
                                                                                                      const terminal = TERMINALS.find(t => t.id === req.params.id);
                                                                                                        if (!terminal) return res.status(404).json({ ok: false, error: '없는 터미널' });
                                                                                                          const result = await fetchTerminal(terminal);
                                                                                                            res.json({ ok: true, ...result });
                                                                                                            });

                                                                                                            app.delete('/api/cache', (req, res) => {
                                                                                                              cache.clear();
                                                                                                                res.json({ ok: true });
                                                                                                                });

                                                                                                                app.get('/api/health', (req, res) => {
                                                                                                                  res.json({ ok: true, uptime: process.uptime() });
                                                                                                                  });

                                                                                                                  app.get('*', (req, res) => {
                                                                                                                    res.sendFile(path.join(__dirname, 'public', 'index.html'));
                                                                                                                    });

                                                                                                                    app.listen(PORT, () => {
                                                                                                                      console.log(`\n⚓ 부산 신항 선석표: http://localhost:${PORT}\n`);
                                                                                                                      });