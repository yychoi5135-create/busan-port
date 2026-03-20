const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.PORTMIS_API_KEY || '';

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

function getDateRange() {
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + 7);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return { startDt: fmt(now), endDt: fmt(future) };
}

async function fetchPortMIS() {
  const cached = getCached('portmis');
  if (cached) { console.log('[Cache HIT]'); return cached; }

  const { startDt, endDt } = getDateRange();
  const url = 'http://apis.data.go.kr/1192000/VsslEtrynd5/Info5';
  const params = {
  serviceKey: API_KEY,
  prtAgCd: 'INC00011',
  sde: startDt,
  ede: endDt,
    numOfRows: 100,
    pageNo: 1,
    type: 'json',
  };

  console.log(`[Fetch] PORT-MIS: ${startDt}~${endDt}`);
  const start = Date.now();
  const res = await axios.get(url, { params, timeout: 15000 });
  const elapsed = Date.now() - start;

  const body = res.data;
  let items = [];
  try {
    if (body?.response?.body?.items?.item) {
      const raw = body.response.body.items.item;
      items = Array.isArray(raw) ? raw : [raw];
    } else if (body?.items?.item) {
      const raw = body.items.item;
      items = Array.isArray(raw) ? raw : [raw];
    }
  } catch(e) { console.error('[Parse Error]', e.message); }

  const vessels = items.map(item => ({
    vslNm:       item.vslNm    || '-',
    callSign:    item.callSign || '-',
    gtNs:        item.gtNs     || '-',
    berth:       item.berthNm  || item.berthNo || '-',
    eta:         item.etaHms   || item.entrPlanDt || '-',
    etd:         item.etdHms   || item.leavPlanDt || '-',
    ata:         item.ataHms   || '-',
    atd:         item.atdHms   || '-',
    status:      item.vslSttus || '-',
    cargo:       item.cargoNm  || '-',
    operator:    item.opertrNm || '-',
    nationality: item.ntnNm    || '-',
  }));

  const result = { vessels, total: vessels.length, timestamp: new Date().toISOString(), elapsed };
  setCache('portmis', result);
  console.log(`[Done] ${vessels.length}척 (${elapsed}ms)`);
  return result;
}

app.get('/api/vessels', async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ ok: false, error: 'API 키 미설정' });
    const data = await fetchPortMIS();
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[Error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), hasApiKey: !!API_KEY });
});

app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n⚓ 부산 신항 선석표: http://localhost:${PORT}`);
  console.log(`API 키: ${API_KEY ? '✅ 설정됨' : '❌ 미설정'}\n`);
});
