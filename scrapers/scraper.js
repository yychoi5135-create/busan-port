const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      };

      // 상태 한글→영문 변환
      function parseStatus(raw) {
        if (!raw || raw === '-') return 'UNKNOWN';
          const s = raw.toUpperCase();
            if (s.includes('작업') || s.includes('WORK') || s.includes('하역')) return 'WORKING';
              if (s.includes('접안') || s.includes('BERTH') || s.includes('입항완료')) return 'BERTHED';
                if (s.includes('예정') || s.includes('PLAN') || s.includes('입항예정') || s.includes('ETA')) return 'PLANNED';
                  if (s.includes('출항') || s.includes('DEPART') || s.includes('완료')) return 'DEPARTED';
                    return raw;
                    }

                    // PNIT / HPNT 전용 파서 (table.table_st1)
                    function parsePnitTable($) {
                      const vessels = [];
                        // 여러 선택자 시도
                          let rows = $('table.table_st1 tbody tr');
                            if (!rows.length) rows = $('table.tbl_list tbody tr');
                              if (!rows.length) rows = $('table tbody tr');

                                rows.each((_, row) => {
                                    const cols = $(row).find('td');
                                        if (cols.length < 5) return;
                                            const get = i => (i < cols.length ? $(cols[i]).text().trim() : '-');

                                                // PNIT 컬럼: [0]번호 [1]VVD [2]선명 [3]선사 [4]선석 [5]ETA [6]ETD [7]상태
                                                    const name = get(2);
                                                        if (!name || name.length < 2 || /^\d+$/.test(name)) return;

                                                            vessels.push({
                                                                  name,
                                                                        vvd:    get(1),
                                                                              owner:  get(3),
                                                                                    berth:  get(4),
                                                                                          eta:    get(5),
                                                                                                etd:    get(6),
                                                                                                      status: parseStatus(get(7) || get(8) || ''),
                                                                                                            rawStatus: get(7) || get(8) || '-',
                                                                                                                });
                                                                                                                  });
                                                                                                                    return vessels;
                                                                                                                    }

                                                                                                                    // 범용 파서
                                                                                                                    function parseGenericTable($) {
                                                                                                                      const vessels = [];
                                                                                                                        const KW = {
                                                                                                                            vvd:    ['vvd','항차','voyage'],
                                                                                                                                name:   ['선명','vessel','ship','vsl name'],
                                                                                                                                    eta:    ['eta','입항예정','arrival'],
                                                                                                                                        etd:    ['etd','출항예정','departure'],
                                                                                                                                            owner:  ['선사','carrier','line'],
                                                                                                                                                berth:  ['선석','berth'],
                                                                                                                                                    status: ['상태','status','sts','작업'],
                                                                                                                                                      };

                                                                                                                                                        let bestTable = null, maxRows = 0;
                                                                                                                                                          $('table').each((_, t) => {
                                                                                                                                                              const n = $(t).find('tr').length;
                                                                                                                                                                  if (n > maxRows) { maxRows = n; bestTable = t; }
                                                                                                                                                                    });
                                                                                                                                                                      if (!bestTable || maxRows < 2) return vessels;

                                                                                                                                                                        const allRows = $(bestTable).find('tr').toArray();
                                                                                                                                                                          const hdrs = $(allRows[0]).find('th,td').toArray()
                                                                                                                                                                              .map(c => $(c).text().trim().toLowerCase());

                                                                                                                                                                                const ci = key => {
                                                                                                                                                                                    for (const k of KW[key]) {
                                                                                                                                                                                          const i = hdrs.findIndex(h => h.includes(k));
                                                                                                                                                                                                if (i !== -1) return i;
                                                                                                                                                                                                    }
                                                                                                                                                                                                        return -1;
                                                                                                                                                                                                          };
                                                                                                                                                                                                            const idx = {};
                                                                                                                                                                                                              Object.keys(KW).forEach(k => idx[k] = ci(k));

                                                                                                                                                                                                                allRows.slice(1).forEach(row => {
                                                                                                                                                                                                                    const cols = $(row).find('td').toArray();
                                                                                                                                                                                                                        if (cols.length < 3) return;
                                                                                                                                                                                                                            const get = i => (i >= 0 && i < cols.length) ? $(cols[i]).text().trim() : '-';
                                                                                                                                                                                                                                const name = get(idx.name);
                                                                                                                                                                                                                                    if (!name || name === '-' || name.length < 2) return;
                                                                                                                                                                                                                                        const rawSts = get(idx.status);
                                                                                                                                                                                                                                            vessels.push({
                                                                                                                                                                                                                                                  name,
                                                                                                                                                                                                                                                        vvd:       get(idx.vvd),
                                                                                                                                                                                                                                                              owner:     get(idx.owner),
                                                                                                                                                                                                                                                                    berth:     get(idx.berth),
                                                                                                                                                                                                                                                                          eta:       get(idx.eta),
                                                                                                                                                                                                                                                                                etd:       get(idx.etd),
                                                                                                                                                                                                                                                                                      status:    parseStatus(rawSts),
                                                                                                                                                                                                                                                                                            rawStatus: rawSts,
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
                                                                                                                                                                                                                                                                                                                                const euc = iconv.decode(Buffer.from(res.data), 'euc-kr');
                                                                                                                                                                                                                                                                                                                                    html = (euc.includes('선명') || euc.includes('vessel') || euc.includes('VSL'))
                                                                                                                                                                                                                                                                                                                                          ? euc : Buffer.from(res.data).toString('utf-8');
                                                                                                                                                                                                                                                                                                                                            } catch {
                                                                                                                                                                                                                                                                                                                                                html = Buffer.from(res.data).toString('utf-8');
                                                                                                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                                                                                                    const $ = cheerio.load(html);
                                                                                                                                                                                                                                                                                                                                                      let vessels = terminal.parser === 'table_st1'
                                                                                                                                                                                                                                                                                                                                                          ? parsePnitTable($) : parseGenericTable($);
                                                                                                                                                                                                                                                                                                                                                            if (!vessels.length && terminal.parser === 'table_st1')
                                                                                                                                                                                                                                                                                                                                                                vessels = parseGenericTable($);
                                                                                                                                                                                                                                                                                                                                                                  return vessels;
                                                                                                                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                                                                                                                  module.exports = { scrapeTerminal };