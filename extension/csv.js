(function exposeCsv(root) {
  const aliases = {
    date: 'date',
    marketplace: 'source',
    source: 'source',
    title: 'title',
    amount: 'amount',
    currency: 'currency',
    category: 'category'
  };

  function parseCsvTable(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const value = String(text || '').replace(/^\uFEFF/, '');

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      const next = value[index + 1];

      if (quoted) {
        if (char === '"' && next === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (char !== '\r') {
        cell += char;
      }
    }

    if (quoted) throw new Error('незакрытая кавычка в CSV');
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function normalizeSource(value) {
    const source = String(value || '').trim().toLowerCase();
    if (source === 'wb' || source === 'wildberries') return 'wildberries';
    if (source === 'ozon') return 'ozon';
    if (source === 'yandex' || source === 'яндекс' || source === 'яндекс маркет') return 'yandex';
    return source;
  }

  function parseSpendCsv(text) {
    const table = parseCsvTable(text).filter((row) => row.some((cell) => String(cell).trim()));
    if (!table.length) return [];

    const headers = table[0].map((header) => aliases[String(header).trim().toLowerCase()] || '');
    const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]).filter(([header]) => header));
    const missing = ['date', 'source', 'title', 'amount'].filter((header) => indexByHeader[header] === undefined);
    if (missing.length) {
      const labels = missing.map((header) => (header === 'source' ? 'marketplace' : header));
      throw new Error(`нет колонок: ${labels.join(', ')}`);
    }

    return table.slice(1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row, index) => {
        const rawAmount = String(row[indexByHeader.amount] || '').replace(/\s+/g, '').replace(',', '.');
        const amount = Number(rawAmount);
        if (!Number.isFinite(amount)) throw new Error(`некорректная сумма в строке ${index + 2}`);
        const date = String(row[indexByHeader.date] || '').trim();
        const source = normalizeSource(row[indexByHeader.source]);
        const title = String(row[indexByHeader.title] || '').trim();
        if (!date || !source || !title) throw new Error(`пустые обязательные поля в строке ${index + 2}`);
        if (source !== 'ozon' && source !== 'wildberries' && source !== 'yandex') {
          throw new Error(`неизвестный marketplace в строке ${index + 2}`);
        }

        return {
          date,
          source,
          title,
          amount: amount.toFixed(2),
          currency: String(row[indexByHeader.currency] || 'RUB').trim() || 'RUB',
          category: String(row[indexByHeader.category] || '').trim()
        };
      });
  }

  root.parseSpendCsv = parseSpendCsv;
  if (typeof module !== 'undefined') module.exports = { parseSpendCsv };
})(typeof globalThis !== 'undefined' ? globalThis : window);
