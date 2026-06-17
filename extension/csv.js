(function exposeCsv(root) {
  const aliases = {
    date: 'date',
    marketplace: 'source',
    source: 'source',
    title: 'title',
    amount: 'amount',
    currency: 'currency',
    category: 'category',
    type: 'type',
    is_return: 'type',
    marketplace_id: 'marketplace_id',
    item_index: 'item_index'
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

  function normalizeType(value, amount) {
    const type = String(value || '').trim().toLowerCase();
    if (type === 'refund' || type === 'return' || type === 'возврат' || type === '1') return 'refund';
    if (type === 'purchase' || type === 'покупка' || type === '0') return 'purchase';
    return amount < 0 ? 'refund' : 'purchase';
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
      .flatMap((row, index) => {
        const rawAmount = String(row[indexByHeader.amount] || '').replace(/\s+/g, '').replace(',', '.');
        const amount = Number(rawAmount);
        if (!Number.isFinite(amount)) throw new Error(`некорректная сумма в строке ${index + 2}`);
        const date = String(row[indexByHeader.date] || '').trim();
        const source = normalizeSource(row[indexByHeader.source]);
        const title = String(row[indexByHeader.title] || '').trim();
        if (!date && source && title.startsWith('Ozon PDF не разобран') && amount === 0) return [];
        if (!date || !source || !title) throw new Error(`пустые обязательные поля в строке ${index + 2}`);
        if (source !== 'ozon' && source !== 'wildberries' && source !== 'yandex') {
          throw new Error(`неизвестный marketplace в строке ${index + 2}`);
        }

        const result = {
          date,
          source,
          title,
          amount: amount.toFixed(2),
          currency: String(row[indexByHeader.currency] || 'RUB').trim() || 'RUB',
          category: String(row[indexByHeader.category] || '').trim(),
          type: normalizeType(row[indexByHeader.type], amount)
        };
        if (indexByHeader.marketplace_id !== undefined) {
          result.marketplace_id = String(row[indexByHeader.marketplace_id] || '').trim();
        }
        if (indexByHeader.item_index !== undefined) {
          result.item_index = String(row[indexByHeader.item_index] || '').trim();
        }
        return [result];
      });
  }

  function normalizeTitle(title) {
    return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizedReceiptKey(row) {
    const receiptKey = String(row.marketplace_id || row.receipt_url || '').trim();
    if (!receiptKey) return '';
    if (row.source === 'ozon') {
      const orderMatch = receiptKey.match(/^(.+?)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d+-\d+)?$/i);
      if (orderMatch) return orderMatch[1];
    }
    return receiptKey;
  }

  function rowSignature(row) {
    return [
      normalizeTitle(row.title),
      Number(row.amount).toFixed(2),
      row.currency || 'RUB',
      row.type || ''
    ].join('\u0001');
  }

  function compatibleSpendRowKey(row) {
    const receiptKey = normalizedReceiptKey(row);
    if (!receiptKey) return '';
    return [row.source, receiptKey, rowSignature(row)].join('\u0001');
  }

  function hasItemIndex(row) {
    return String(row.item_index || '').trim() !== '';
  }

  function spendRowKey(row) {
    const receiptKey = normalizedReceiptKey(row);
    if (!receiptKey) return '';
    const itemKey = String(row.item_index || '').trim();
    return [
      row.source,
      receiptKey,
      itemKey || normalizeTitle(row.title),
      rowSignature(row)
    ].join('\u0001');
  }

  function mergeSpendRows(rows) {
    const list = rows || [];
    const indexedRows = new Set(list
      .filter(hasItemIndex)
      .map(compatibleSpendRowKey)
      .filter(Boolean));
    const seen = new Set();
    const merged = [];
    let duplicates = 0;
    for (const row of list) {
      if (!hasItemIndex(row) && indexedRows.has(compatibleSpendRowKey(row))) {
        duplicates += 1;
        continue;
      }
      const key = spendRowKey(row);
      if (key && seen.has(key)) {
        duplicates += 1;
      } else {
        if (key) seen.add(key);
        merged.push(row);
      }
    }
    return { rows: merged, duplicates };
  }

  root.parseSpendCsv = parseSpendCsv;
  root.mergeSpendRows = mergeSpendRows;
  if (typeof module !== 'undefined') module.exports = { parseSpendCsv, mergeSpendRows };
})(typeof globalThis !== 'undefined' ? globalThis : window);
