const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function parseTableSt1($) {
  const vessels = [];
  $('table.table_st1 tbody tr').each((_, row) => {
    const cols = $(row).find('td');
    if (cols.length < 6) return;
    const get = i => $(cols[i]).text().trim();
    const name = get(2);
    if (!name || name.length < 2) return;
    vessels.push({
      vvd: get(1), name,
      owner: get(3), berth: get(4),
      eta: get(5), etd: cols.length > 6 ? get(6) : '-',
      status: cols.length > 7 ? get(7) : '-',
    });
  });
  return vessels;
}

function parseGeneric($) {
  const vessels = [];
  const KW = {
    vvd:    ['vvd','항차','voyage'],
    name:   ['선명','vessel','ship','vsl'],
    eta:    ['eta','입항','arrival'],
    etd:    ['etd','출항','departure'],
    owner:  ['선사','carrier','owner','line'],
    berth:  ['선석','berth','wharf'],
    status: ['상태','status','sts'],
  };

  let bestTable = null, maxRows = 0;
  $('table').each((_, tbl) => {
    const cnt = $(tbl).find('tr').length;
    if (cnt > maxRows) { maxRows = cnt; bestTable = tbl; }
  });
  if (!bestTable) return vessels;

  const allRows = $(bestTable).find('tr').toArray();
  if (allRows.length < 2) return vessels;

  const headers = $(allRows[0]).find('th,td').toArray()
    .map(c => $(c).text().trim().toLowerCase());

  const ci = key => {
    for (const k of KW[key]) {
      const i = headers.findIndex(h => h.includes(k));
      if (i !== -1) return i;
    }
    return -1;
  };
  const idx = Object.fromEntries(Object.keys(KW).map(k => [k, ci(k)]));

  allRows.slice(1).forEach(row => {
    const cols = $(row).find('td').toArray();
    if (cols.length < 4) return;
    const get = i => (i >= 0 && i < cols.length) ? $(cols[i]).text().trim() : '-';
    const name = get(idx.name);
    if (!name || name === '-' || name.length < 2) return;
    vessels.push({
      name, vvd: get(idx.vvd), owner: get(idx.owner),
      berth: get(idx.berth), eta: get(idx.eta),
      etd: get(idx.etd), status: get(idx.status),
    });
  });
  return vessels;
}

async function scrapeTerminal(terminal) {
  const res = await axios.get(terminal.url, {
    headers: HEADERS,
    timeout: 15000,
    responseType: 'arraybuffer',
  });

  let html;
  try {
    const iconv = require('iconv-lite');
    html = iconv.decode(Buffer.from(res.data), 'euc-kr');
    if (!html.includes('선명') && !html.includes('vessel') && !html.includes('VSL')) {
      html = Buffer.from(res.data).toString('utf-8');
    }
  } catch {
    html = Buffer.from(res.data).toString('utf-8');
  }

  const $ = cheerio.load(html);
  let vessels = terminal.parser === 'table_st1' ? parseTableSt1($) : parseGeneric($);
  if (!vessels.length && terminal.parser === 'table_st1') vessels = parseGeneric($);
  return vessels;
}

module.exports = { scrapeTerminal };