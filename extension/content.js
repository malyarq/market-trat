(() => {
  if (window.__marketplaceSpendExporterInjected) return;
  window.__marketplaceSpendExporterInjected = true;

  const api = globalThis.chrome;

  function sendProgress(message, value = null, max = null) {
    try {
      const result = api.runtime.sendMessage({
        type: 'SPEND_PROGRESS',
        message,
        value,
        max
      });
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Popup can be closed while collection is still running.
    }
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        api.runtime.sendMessage(message, (response) => resolve(response || {}));
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clampConcurrency(value, fallback, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.max(1, Math.min(max, Math.floor(parsed)));
  }

  async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runWorker()
    );
    await Promise.all(workers);
    return results;
  }

  let pdfjsPromise = null;

  async function fetchText(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers: {
        accept: 'text/html,application/json,*/*',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.text();
  }

  async function fetchArrayBuffer(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers: {
        accept: 'application/pdf,*/*',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    const buffer = await response.arrayBuffer();
    const header = String.fromCharCode(...new Uint8Array(buffer.slice(0, 5)));
    if (header !== '%PDF-') throw new Error(`not a PDF for ${url}`);
    return buffer;
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\\u002d/gi, '-')
      .replace(/\\u005f/gi, '_')
      .replace(/\\u002f/gi, '/')
      .replace(/\\u003a/gi, ':')
      .replace(/\\u003f/gi, '?')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u0025/gi, '%')
      .replace(/&amp;/g, '&')
      .replace(/\\\//g, '/');
  }

  function tryJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function decodeJsonString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value;
    }
  }

  function amountFromText(text) {
    const normalized = String(text || '')
      .replace(/\u00a0|\u202f/g, '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  const ruMonths = {
    января: '01',
    февраля: '02',
    марта: '03',
    апреля: '04',
    мая: '05',
    июня: '06',
    июля: '07',
    августа: '08',
    сентября: '09',
    октября: '10',
    ноября: '11',
    декабря: '12'
  };

  function parseOzonDate(rawDate) {
    const text = String(rawDate || '').toLowerCase();
    const match = text.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+в\s+(\d{1,2}):(\d{2})/i);
    if (!match) return '';
    const day = match[1].padStart(2, '0');
    const month = ruMonths[match[2]];
    if (!month) return '';
    return `${match[3]}-${month}-${day} ${match[4].padStart(2, '0')}:${match[5]}`;
  }

  function monthFromDate(date) {
    const match = String(date || '').match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : '';
  }

  function normalizeReceiptText(text) {
    return String(text || '')
      .replace(/\u00a0|\u202f/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseOzonPdfDate(text) {
    const match = String(text || '').match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (!match) return '';
    return `${match[3]}-${match[2]}-${match[1]} ${match[4]}:${match[5]}`;
  }

  async function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(api.runtime.getURL('vendor/pdf.mjs')).then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = api.runtime.getURL('vendor/pdf.worker.mjs');
        return pdfjsLib;
      });
    }
    return pdfjsPromise;
  }

  function pdfTextContentToText(content) {
    const tokens = (content.items || [])
      .map((item, index) => {
        const transform = item.transform || [];
        return {
          str: String(item.str || '').trim(),
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
          index
        };
      })
      .filter((item) => item.str);

    tokens.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.x - b.x || a.index - b.index;
    });

    const lines = [];
    for (const token of tokens) {
      const current = lines[lines.length - 1];
      if (!current || Math.abs(current.y - token.y) > 2) {
        lines.push({ y: token.y, parts: [token] });
      } else {
        current.parts.push(token);
      }
    }

    return lines
      .map((line) => line.parts
        .sort((a, b) => a.x - b.x || a.index - b.index)
        .map((part) => part.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean)
      .join('\n');
  }

  async function extractTextFromPdfBuffer(buffer) {
    const pdfjsLib = await loadPdfjs();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: pdfjsLib.VerbosityLevel?.ERRORS
    });
    const pdf = await loadingTask.promise;

    try {
      const pageNumbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
      const pages = await mapWithConcurrency(pageNumbers, 2, async (pageNumber) => {
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          return pdfTextContentToText(content);
        } finally {
          page.cleanup();
        }
      });
      return normalizeReceiptText(pages.join('\n'));
    } finally {
      await pdf.destroy();
    }
  }

  function extractOzonPdfTotal(text) {
    const match = String(text || '').match(/ИТОГ[\s\S]{0,80}?≡?\s*(-?\d[\d\s]*(?:[,.]\d{2}))/i);
    return match ? amountFromText(match[1]) : 0;
  }

  function isOzonPdfReturn(text, fallbackRecord) {
    const header = String(text || '').split(/ИТОГ/i)[0] || '';
    return /возврат\s+прихода|возврат/i.test(header)
      || fallbackRecord?.type === 'refund'
      || fallbackRecord?.is_return === '1';
  }

  function detectOzonSettlementKind(text) {
    const normalized = normalizeOzonKeyText(text);
    if (/полный\s+расч[её]т/.test(normalized)) return 'full';
    if (/предоплат|получение\s+аванса|аванс/.test(normalized)) return 'prepayment';
    return '';
  }

  function extractOzonAmountFromLine(line) {
    const match = String(line || '').match(/≡\s*(-?\d[\d\s]*(?:[,.]\d{1,2})?)/i);
    return match ? amountFromText(match[1]) : 0;
  }

  function extractOzonItemAmount(lines) {
    for (const line of lines) {
      const amount = extractOzonAmountFromLine(line);
      if (amount) return amount;
    }
    return 0;
  }

  function makeOzonRow({ item, date, isReturn, settlementKind, fallbackRecord }) {
    return {
      source: 'ozon',
      month: monthFromDate(date),
      date,
      amount: (isReturn ? -Math.abs(item.amount) : item.amount).toFixed(2),
      currency: fallbackRecord.currency || 'RUB',
      title: item.title,
      category: '',
      type: isReturn ? 'refund' : 'purchase',
      is_return: isReturn ? '1' : '0',
      marketplace_id: fallbackRecord.marketplace_id || '',
      receipt_url: fallbackRecord.receipt_url || '',
      raw_title: fallbackRecord.raw_title || fallbackRecord.title || '',
      raw_amount: String(item.amount),
      __ozonSettlementKind: settlementKind || ''
    };
  }

  function ozonUnparsedRow(fallbackRecord, reason) {
    return {
      ...fallbackRecord,
      title: `Ozon PDF не разобран: ${fallbackRecord.title || fallbackRecord.marketplace_id || 'чек'}`,
      raw_title: `${fallbackRecord.raw_title || fallbackRecord.title || ''} parse_error=${reason || 'unknown'}`.trim()
    };
  }

  function normalizeOzonKeyText(text) {
    return String(text || '')
      .replace(/\u00a0|\u202f/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isOzonOperationalRow(row) {
    const title = normalizeOzonKeyText(row?.title);
    return title === 'получение аванса' || title === 'возврат оплаты';
  }

  function ozonOrderKey(row) {
    const rawTitleMatch = String(row?.raw_title || '').match(/Заказ №(\S+)/);
    if (rawTitleMatch) return rawTitleMatch[1];
    const receiptId = String(row?.receipt_url || '').match(/[?&]id=([^&]+)/)?.[1] || row?.marketplace_id || '';
    const idPrefixMatch = String(receiptId).match(/^(.+?)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d+-\d+)?$/i);
    if (idPrefixMatch) return idPrefixMatch[1];
    return row?.receipt_url || row?.marketplace_id || '';
  }

  function isOzonDeliveryTitle(title) {
    const normalized = normalizeOzonKeyText(title);
    return normalized.includes('доставка') || normalized === 'обработка заказа в пункте выдачи';
  }

  function ozonDedupTitle(title) {
    return isOzonDeliveryTitle(title) ? 'доставка' : normalizeOzonKeyText(title);
  }

  function ozonAmountCents(value) {
    return Math.round(amountFromText(value) * 100);
  }

  function latestDate(rows) {
    return rows.reduce((latest, row) => String(row.date || '') > latest ? String(row.date || '') : latest, '');
  }

  function normalizeOzonOutputRow(row) {
    const { __ozonSettlementKind, ...outputRow } = row;
    return isOzonDeliveryTitle(outputRow.title) && outputRow.title !== 'Доставка'
      ? { ...outputRow, title: 'Доставка' }
      : outputRow;
  }

  function centsToAmount(cents) {
    return (cents / 100).toFixed(2);
  }

  function foldDeliveryIntoRows(rows) {
    const rowsByReceipt = new Map();
    let deliveryRowsFolded = 0;
    let deliveryRowsDropped = 0;

    for (const row of rows) {
      const key = ozonReceiptKey(row);
      if (!rowsByReceipt.has(key)) rowsByReceipt.set(key, []);
      rowsByReceipt.get(key).push(row);
    }

    const foldedRows = [];

    for (const receiptRows of rowsByReceipt.values()) {
      const deliveryRows = receiptRows.filter((row) => isOzonDeliveryTitle(row.title));
      const itemRows = receiptRows.filter((row) => !isOzonDeliveryTitle(row.title)).map((row) => ({ ...row }));

      if (!deliveryRows.length) {
        foldedRows.push(...receiptRows);
        continue;
      }

      if (!itemRows.length) {
        deliveryRowsDropped += deliveryRows.length;
        continue;
      }

      for (const sign of [1, -1]) {
        const signedDeliveryRows = deliveryRows.filter((row) => Math.sign(ozonAmountCents(row.amount)) === sign);
        const signedItemRows = itemRows.filter((row) => Math.sign(ozonAmountCents(row.amount)) === sign);
        const deliveryCents = signedDeliveryRows.reduce((sum, row) => sum + ozonAmountCents(row.amount), 0);
        const itemBaseCents = signedItemRows.reduce((sum, row) => sum + Math.abs(ozonAmountCents(row.amount)), 0);

        if (!deliveryCents || !itemBaseCents || !signedItemRows.length) {
          deliveryRowsDropped += signedDeliveryRows.length;
          continue;
        }

        let remaining = Math.abs(deliveryCents);
        signedItemRows.forEach((row, index) => {
          const rowCents = ozonAmountCents(row.amount);
          const allocation = index === signedItemRows.length - 1
            ? remaining
            : Math.floor(Math.abs(deliveryCents) * Math.abs(rowCents) / itemBaseCents);
          remaining -= allocation;
          row.amount = centsToAmount(rowCents + sign * allocation);
        });

        deliveryRowsFolded += signedDeliveryRows.length;
      }

      foldedRows.push(...itemRows);
    }

    return { rows: foldedRows, deliveryRowsFolded, deliveryRowsDropped };
  }

  function ozonReceiptKey(row) {
    return row.receipt_url || row.marketplace_id || '';
  }

  function ozonPositiveTitleKeys(rows) {
    const keys = new Set();
    for (const row of rows) {
      if (ozonAmountCents(row.amount) > 0) keys.add(ozonDedupTitle(row.title));
    }
    return keys;
  }

  function hasSetOverlap(left, right) {
    for (const value of left) {
      if (right.has(value)) return true;
    }
    return false;
  }

  function filterOzonRows(rows) {
    const directRows = [];
    const rowsByOrder = new Map();
    let operationalRowsDropped = 0;
    let prepaymentRowsDropped = 0;
    let duplicateRowsDropped = 0;
    let adjustmentRowsDropped = 0;

    for (const row of rows) {
      if (isOzonOperationalRow(row)) {
        operationalRowsDropped += 1;
        continue;
      }

      if (String(row.title || '').startsWith('Ozon PDF не разобран')) {
        directRows.push(row);
        continue;
      }

      const orderKey = ozonOrderKey(row);
      if (!rowsByOrder.has(orderKey)) rowsByOrder.set(orderKey, []);
      rowsByOrder.get(orderKey).push(row);
    }

    const filteredRows = directRows.slice();

    for (const orderRows of rowsByOrder.values()) {
      const rowsByUrl = new Map();
      for (const row of orderRows) {
        const url = ozonReceiptKey(row);
        if (!rowsByUrl.has(url)) rowsByUrl.set(url, []);
        rowsByUrl.get(url).push(row);
      }

      const receiptGroups = [...rowsByUrl.entries()].map(([url, receiptRows]) => ({
        url,
        rows: receiptRows,
        date: latestDate(receiptRows),
        hasOnlyPositiveRows: receiptRows.every((row) => ozonAmountCents(row.amount) >= 0),
        hasPrepaymentKind: receiptRows.some((row) => row.__ozonSettlementKind === 'prepayment'),
        positiveTitleKeys: ozonPositiveTitleKeys(receiptRows)
      }));

      const droppedPositiveTitleKeys = new Set();
      const candidateRows = [];

      for (const group of receiptGroups) {
        const hasLaterPositiveOverlap = group.hasOnlyPositiveRows
          && group.positiveTitleKeys.size > 0
          && receiptGroups.some((otherGroup) => (
            otherGroup.url !== group.url
            && otherGroup.date > group.date
            && hasSetOverlap(group.positiveTitleKeys, otherGroup.positiveTitleKeys)
          ));

        if (hasLaterPositiveOverlap) {
          if (group.hasPrepaymentKind) prepaymentRowsDropped += group.rows.length;
          else duplicateRowsDropped += group.rows.length;
          for (const key of group.positiveTitleKeys) droppedPositiveTitleKeys.add(key);
          continue;
        }

        candidateRows.push(...group.rows);
      }

      const keptPositiveDatesByTitle = new Map();
      for (const row of candidateRows) {
        if (ozonAmountCents(row.amount) <= 0) continue;
        const key = ozonDedupTitle(row.title);
        if (!keptPositiveDatesByTitle.has(key)) keptPositiveDatesByTitle.set(key, []);
        keptPositiveDatesByTitle.get(key).push(String(row.date || ''));
      }

      for (const row of candidateRows) {
        const amountCents = ozonAmountCents(row.amount);
        if (amountCents < 0) {
          const key = ozonDedupTitle(row.title);
          const positiveDates = keptPositiveDatesByTitle.get(key) || [];
          const hasLaterPositive = positiveDates.some((date) => date > String(row.date || ''));
          if (hasLaterPositive || (!positiveDates.length && droppedPositiveTitleKeys.has(key))) {
            adjustmentRowsDropped += 1;
            continue;
          }
        }

        filteredRows.push(row);
      }
    }

    const deliveryFolded = foldDeliveryIntoRows(filteredRows);

    return {
      rows: deliveryFolded.rows.map(normalizeOzonOutputRow),
      operationalRowsDropped,
      prepaymentRowsDropped,
      duplicateRowsDropped,
      adjustmentRowsDropped,
      deliveryRowsFolded: deliveryFolded.deliveryRowsFolded,
      deliveryRowsDropped: deliveryFolded.deliveryRowsDropped
    };
  }

  function parseOzonPdfRows(text, fallbackRecord) {
    const normalized = normalizeReceiptText(text);
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    const date = parseOzonPdfDate(normalized) || fallbackRecord.date || '';
    const isReturn = isOzonPdfReturn(normalized, fallbackRecord);
    const settlementKind = detectOzonSettlementKind(normalized);
    const items = [];

    for (let index = 0; index < lines.length; index += 1) {
      const itemMatch = lines[index].match(/^(\d{1,3})\.(?:\s+(.*)|\s*)$/);
      if (!itemMatch) continue;

      const titleParts = [];
      if (itemMatch[2]) titleParts.push(itemMatch[2]);

      const itemLines = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next];
        if (/^\d{1,3}\.(?:\s|$)/.test(line) || /^ИТОГ\b/i.test(line)) break;
        itemLines.push(line);
      }

      const amountLineIndex = itemLines.findIndex((line) => extractOzonAmountFromLine(line));
      const titleLines = amountLineIndex === -1 ? itemLines : itemLines.slice(0, amountLineIndex);
      for (const line of titleLines) {
        titleParts.push(line);
      }

      const amount = extractOzonItemAmount(itemLines);
      const title = titleParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!title || !amount) continue;
      items.push({ title, amount });
    }

    if (!items.length) {
      const total = extractOzonPdfTotal(normalized);
      if (!total) return [];
      items.push({
        title: `Ozon PDF: ${fallbackRecord.title || fallbackRecord.marketplace_id || 'чек'}`,
        amount: total
      });
    }

    return items.map((item) => makeOzonRow({ item, date, isReturn, settlementKind, fallbackRecord }));
  }

  async function recordsFromOzonPdf(record) {
    const buffer = await fetchArrayBuffer(record.receipt_url);
    const text = await extractTextFromPdfBuffer(buffer);
    if (!text) return [];
    return parseOzonPdfRows(text, record);
  }

  async function rowsFromOzonPdfs(records, parsePdf, concurrencyOption) {
    if (!parsePdf) {
      return {
        rows: records.map((record) => ozonUnparsedRow(record, 'pdf_parsing_disabled')),
        stats: {
          receipts: records.length,
          parsedReceipts: 0,
          failedReceipts: records.length,
          itemRows: 0
        }
      };
    }

    const concurrency = clampConcurrency(concurrencyOption, 8, 12);
    const failed = [];
    let parsedReceipts = 0;
    let completed = 0;
    sendProgress(`Ozon: PDF-разбор в ${concurrency} потока.`, 0, records.length);

    const results = await mapWithConcurrency(records, concurrency, async (record) => {
      try {
        const parsed = await recordsFromOzonPdf(record);
        if (parsed.length) {
          parsedReceipts += 1;
          return { rows: parsed };
        } else {
          const failedItem = { record, reason: 'no_items' };
          failed.push(failedItem);
          return { rows: [ozonUnparsedRow(record, failedItem.reason)] };
        }
      } catch (error) {
        const failedItem = { record, reason: error.message };
        failed.push(failedItem);
        return { rows: [ozonUnparsedRow(record, failedItem.reason)] };
      } finally {
        completed += 1;
        if (completed === records.length || completed % 5 === 0) {
          sendProgress(
            `Ozon: PDF ${completed}/${records.length}, разобрано ${parsedReceipts}, ошибок ${failed.length}.`,
            completed,
            records.length
          );
        }
      }
    });

    const rawRows = results.flatMap((result) => result.rows);
    const filtered = filterOzonRows(rawRows);

    const droppedRows = filtered.operationalRowsDropped
      + filtered.prepaymentRowsDropped
      + filtered.duplicateRowsDropped
      + filtered.adjustmentRowsDropped;
    if (droppedRows || filtered.deliveryRowsFolded || filtered.deliveryRowsDropped) {
      sendProgress(
        `Ozon: убрано предоплат/дублей ${filtered.prepaymentRowsDropped + filtered.duplicateRowsDropped}, служебных строк ${filtered.operationalRowsDropped}, корректировок ${filtered.adjustmentRowsDropped}, доставок распределено ${filtered.deliveryRowsFolded}, доставок удалено ${filtered.deliveryRowsDropped}.`,
        records.length,
        records.length
      );
    }

    return {
      rows: filtered.rows,
      stats: {
        receipts: records.length,
        parsedReceipts,
        failedReceipts: failed.length,
        itemRows: filtered.rows.length,
        rawItemRows: rawRows.length,
        duplicateRowsDropped: filtered.duplicateRowsDropped,
        prepaymentRowsDropped: filtered.prepaymentRowsDropped,
        operationalRowsDropped: filtered.operationalRowsDropped,
        adjustmentRowsDropped: filtered.adjustmentRowsDropped,
        deliveryRowsFolded: filtered.deliveryRowsFolded,
        deliveryRowsDropped: filtered.deliveryRowsDropped,
        failedSamples: failed.slice(0, 5).map((item) => item.record.marketplace_id || item.record.title || '')
      }
    };
  }

  function isReturnLike(...values) {
    return /возврат|refund|return|возврат прихода/i.test(values.filter(Boolean).join(' '));
  }

  function normalizeOzonUrl(url) {
    if (!url) return '';
    const normalized = normalizeText(url);
    if (normalized.startsWith('https://ozon.ru/')) return normalized.replace('https://ozon.ru/', 'https://www.ozon.ru/');
    if (normalized.startsWith('/')) return `https://www.ozon.ru${normalized}`;
    return normalized;
  }

  function ozonRecordKey(record) {
    return record.marketplace_id || record.receipt_url || '';
  }

  function makeOzonRecord({ receiptUrl, title = 'Ozon cheque', rawDate = '', rawAmount = '' }) {
    const date = parseOzonDate(rawDate);
    const baseAmount = amountFromText(rawAmount);
    const isReturn = isReturnLike(title, rawDate, rawAmount);
    const amount = isReturn ? -Math.abs(baseAmount) : baseAmount;
    let id = '';
    try {
      id = new URL(receiptUrl).searchParams.get('id') || '';
    } catch {
      id = '';
    }

    return {
      source: 'ozon',
      month: monthFromDate(date),
      date,
      amount: amount.toFixed(2),
      currency: 'RUB',
      title: String(title || 'Ozon cheque').trim(),
      category: '',
      type: isReturn ? 'refund' : 'purchase',
      is_return: isReturn ? '1' : '0',
      marketplace_id: id,
      receipt_url: receiptUrl,
      raw_title: `${title} ${rawDate}`.trim(),
      raw_amount: rawAmount
    };
  }

  function extractOzonDownloadRecords(text) {
    const records = [];
    const seen = new Set();
    const normalized = normalizeText(text);
    const matches = normalized.matchAll(/(?:https?:\/\/(?:www\.)?ozon\.ru)?\/[^"'<>\s]*downloadCheque[^"'<>\s]*/gi);

    for (const match of matches) {
      const receiptUrl = normalizeOzonUrl(match[0].replace(/[),.;]+$/, ''));
      if (!receiptUrl || seen.has(receiptUrl)) continue;
      seen.add(receiptUrl);
      records.push(makeOzonRecord({ receiptUrl }));
    }

    return records;
  }

  function extractOzonNextPage(text) {
    const json = tryJsonParse(text);
    if (json?.nextPage) return normalizeText(json.nextPage);

    const normalized = normalizeText(text);
    const direct = normalized.match(/"nextPage"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (direct?.[1]) return normalizeText(decodeJsonString(direct[1]));
    return '';
  }

  function parseOzonStateValue(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    return tryJsonParse(normalizeText(value));
  }

  function extractOzonCheques(text) {
    const records = [];
    const seen = new Set();
    const json = tryJsonParse(text);
    const stateValues = [];

    function addRecord(record) {
      const key = ozonRecordKey(record);
      if (!key || seen.has(key)) return;
      seen.add(key);
      records.push(record);
    }

    function addCheque(cheque) {
      const receiptUrl = normalizeOzonUrl(cheque?.button?.action?.link || cheque?.downloadUrl || cheque?.link || '');
      if (!receiptUrl || !/downloadCheque/i.test(receiptUrl)) return;
      addRecord(makeOzonRecord({
        receiptUrl,
        title: String(cheque.title || 'Ozon cheque').trim(),
        rawDate: String(cheque.subtitle || cheque.date || '').trim(),
        rawAmount: String(cheque.price || cheque.amount || '').trim()
      }));
    }

    function visit(value, key = '') {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        if (/cheques?/i.test(key)) {
          for (const item of value) addCheque(item);
        }
        for (const item of value) visit(item);
        return;
      }
      addCheque(value);
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey);
    }

    if (json?.widgetStates && typeof json.widgetStates === 'object') {
      stateValues.push(...Object.values(json.widgetStates));
    }
    visit(json);

    const normalized = normalizeText(text);
    const widgetStateMatches = normalized.matchAll(/"cheques-[^"]+"\s*:\s*"((?:\\.|[^"\\])*)"/g);
    for (const match of widgetStateMatches) {
      stateValues.push(decodeJsonString(match[1]));
    }

    for (const value of stateValues) {
      const state = parseOzonStateValue(value);
      if (!Array.isArray(state?.cheques)) continue;

      for (const cheque of state.cheques) {
        addCheque(cheque);
      }
    }

    for (const record of extractOzonDownloadRecords(normalized)) addRecord(record);

    return records;
  }

  function findOzonChequeTextNode(link) {
    let node = link;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = String(node.innerText || node.textContent || '').trim();
      if (/Заказ №\S+/.test(text) && /\d{1,2}\s+[а-яё]+\s+\d{4}\s+в\s+\d{1,2}:\d{2}/i.test(text)) {
        return text;
      }
      node = node.parentElement;
    }
    return String(link.closest('body')?.innerText || '').slice(0, 2000);
  }

  function extractOzonChequesFromDom() {
    const records = [];
    const seen = new Set();
    const links = [...document.querySelectorAll('a[href*="downloadCheque"], a[href*="/_action/downloadCheque"]')];

    function addRecord(record) {
      const key = ozonRecordKey(record);
      if (!key || seen.has(key)) return;
      seen.add(key);
      records.push(record);
    }

    for (const link of links) {
      const receiptUrl = normalizeOzonUrl(link.href || link.getAttribute('href') || '');
      if (!receiptUrl) continue;

      const text = normalizeReceiptText(findOzonChequeTextNode(link));
      const title = text.match(/Заказ №\S+/)?.[0] || 'Ozon cheque';
      const rawDate = text.match(/\d{1,2}\s+[а-яё]+\s+\d{4}\s+в\s+\d{1,2}:\d{2}/i)?.[0] || '';
      const rawAmount = (text.match(/-?\d[\d\s.,]*\s*₽/g) || []).at(-1) || '';
      const date = parseOzonDate(rawDate);
      const baseAmount = amountFromText(rawAmount);
      const isReturn = isReturnLike(title, rawDate, rawAmount);
      const amount = isReturn ? -Math.abs(baseAmount) : baseAmount;
      const id = new URL(receiptUrl).searchParams.get('id') || '';

      addRecord({
        source: 'ozon',
        month: monthFromDate(date),
        date,
        amount: amount.toFixed(2),
        currency: 'RUB',
        title,
        category: '',
        type: isReturn ? 'refund' : 'purchase',
        is_return: isReturn ? '1' : '0',
        marketplace_id: id,
        receipt_url: receiptUrl,
        raw_title: `${title} ${rawDate}`.trim(),
        raw_amount: rawAmount
      });
    }

    const html = document.documentElement?.innerHTML || '';
    for (const record of extractOzonDownloadRecords(html)) addRecord(record);

    return records;
  }

  function ozonResourceUrls() {
    try {
      return [...performance.getEntriesByType('resource')]
        .map((entry) => entry.name)
        .filter((url) => /ozon\.ru\/.*(?:e-check|cheque|entrypoint-api|page\/json)/i.test(url))
        .slice(-80);
    } catch {
      return [];
    }
  }

  async function collectOzon({ maxPages, parsePdf, pdfConcurrency, apiPauseMs }) {
    if (!/^https:\/\/(?:www\.)?ozon\.ru\//.test(location.href)) {
      throw new Error('Ozon: открыта не вкладка Ozon.');
    }

    const recordsByKey = new Map();
    const visitedNextPages = new Set();
    let pagesFetched = 0;

    function remember(records) {
      for (const record of records) {
        const key = ozonRecordKey(record);
        if (key && !recordsByKey.has(key)) recordsByKey.set(key, record);
      }
    }

    function claimNextPage(rawNextPage) {
      const nextPage = normalizeText(rawNextPage);
      if (!nextPage || visitedNextPages.has(nextPage) || pagesFetched >= maxPages) return null;
      visitedNextPages.add(nextPage);
      pagesFetched += 1;
      return { nextPage, pageNumber: pagesFetched };
    }

    async function collectList(startUrl) {
      const firstPageText = await fetchText(startUrl).catch(() => '');
      if (!firstPageText) return;

      remember(extractOzonCheques(firstPageText));
      let nextPage = extractOzonNextPage(firstPageText);

      while (true) {
        const claimed = claimNextPage(nextPage);
        if (!claimed) break;

        const apiUrl = `${location.origin}/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(claimed.nextPage)}`;
        const text = await fetchText(apiUrl);
        remember(extractOzonCheques(text));
        sendProgress(`Ozon: найдено ${recordsByKey.size}, API-страница ${claimed.pageNumber}.`, claimed.pageNumber, maxPages);
        nextPage = extractOzonNextPage(text);
        if (apiPauseMs > 0) await sleep(apiPauseMs);
      }
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const domRecords = extractOzonChequesFromDom();
      remember(domRecords);
      if (domRecords.length) {
        sendProgress(`Ozon: найдено ${recordsByKey.size} чеков в открытой странице.`);
        break;
      }
      await sleep(500);
    }

    const resourceUrls = ozonResourceUrls();
    for (const resourceUrl of resourceUrls) {
      const text = await fetchText(resourceUrl).catch(() => '');
      if (text) remember(extractOzonCheques(text));
    }
    if (resourceUrls.length) {
      sendProgress(`Ozon: проверено ресурсов страницы ${resourceUrls.length}, чеков ${recordsByKey.size}.`);
    }

    await Promise.all([...new Set([
      `${location.origin}/my/e-check`,
      `${location.origin}/my/e-check?archive=1`,
      location.href
    ])].map((candidate) => collectList(candidate)));

    if (!recordsByKey.size) {
      throw new Error('Ozon: чеки не найдены. Проверьте, что вы залогинены, и откройте /my/e-check.');
    }

    const records = [...recordsByKey.values()];
    sendProgress(`Ozon: найдено ссылок на чеки ${records.length}, начинаю PDF-разбор.`, 0, records.length);
    return rowsFromOzonPdfs(records, parsePdf, pdfConcurrency);
  }

  function readCookie(name) {
    const parts = document.cookie.split(/;\s*/);
    for (const part of parts) {
      const index = part.indexOf('=');
      if (index < 0) continue;
      if (part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
    }
    return '';
  }

  function decodeJwtPayload(token) {
    try {
      const part = String(token || '').split('.')[1];
      if (!part) return null;
      const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
      return JSON.parse(decodeURIComponent(escape(atob(padded))));
    } catch {
      return null;
    }
  }

  function looksLikeWbJwt(token) {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(token || ''))) return false;
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload !== 'object') return false;
    const wbHints = String([payload.iss, payload.aud, payload.client_id].filter(Boolean).join(' '));
    return /wb\.ru|wildberries/i.test(wbHints)
      || payload.client_id === 'wb'
      || Boolean(payload.user && payload.session_id && payload.validation_key);
  }

  function findWbJwtInText(text) {
    const candidates = String(text || '').match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    return candidates.find(looksLikeWbJwt) || '';
  }

  function findWbJwtInStorage() {
    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        const value = key ? store.getItem(key) : '';
        const token = findWbJwtInText(value);
        if (token) return token;
      }
    }
    return '';
  }

  async function getWbJwtToken() {
    const fromDocument = readCookie('wbid-sdk-id-token');
    if (looksLikeWbJwt(fromDocument)) return fromDocument;

    const fromStorage = findWbJwtInStorage();
    if (fromStorage) return fromStorage;

    for (const url of ['https://www.wildberries.ru/', 'https://wildberries.ru/', 'https://astro.wildberries.ru/']) {
      const response = await sendMessage({
        type: 'SPEND_GET_COOKIE',
        url,
        name: 'wbid-sdk-id-token'
      });
      if (response?.ok && looksLikeWbJwt(response.value)) return response.value;
    }

    throw new Error('Wildberries: не найден WB JWT. Войдите в аккаунт WB и не подставляйте wbid-sdk-id-token вручную.');
  }

  function normalizeWbReceiptPayload(json) {
    const candidates = [
      json?.data?.result?.data,
      json?.data?.GetReceiptsV4V1?.data,
      json?.result?.data,
      json?.data
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate?.receipts)) {
        return {
          receipts: candidate.receipts,
          nextReceiptUid: candidate.nextReceiptUid || candidate.nextReceiptUID || ''
        };
      }
    }

    return { receipts: [], nextReceiptUid: '' };
  }

  async function fetchWbReceiptsPage({ token, pageSize, nextReceiptUid }) {
    const url = new URL('https://astro.wildberries.ru/api/v1/receipt-api/v1/receipts');
    url.searchParams.set('receiptsPerPage', String(pageSize));
    url.searchParams.set('nextReceiptUid', nextReceiptUid || '');

    const response = await fetch(url.toString(), {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error(`Wildberries API returned ${response.status}`);
    return normalizeWbReceiptPayload(await response.json());
  }

  function wbPageSizeCandidates(pageSize) {
    const requested = Math.max(1, Math.min(100, Number(pageSize) || 10));
    return [...new Set([requested, 50, 10].filter((size) => size <= requested))];
  }

  async function collectWildberries({ maxPages, pageSize, apiPauseMs }) {
    if (!/^https:\/\/(?:www\.)?wildberries\.ru\//.test(location.href)) {
      throw new Error('Wildberries: открыта не вкладка Wildberries.');
    }

    const token = await getWbJwtToken();
    const receiptsByUid = new Map();
    const seenCursors = new Set();
    const pageSizes = wbPageSizeCandidates(pageSize);
    let pageSizeIndex = 0;
    let activePageSize = pageSizes[pageSizeIndex];
    let nextReceiptUid = '';
    let pagesFetched = 0;

    while (pagesFetched < maxPages) {
      if (seenCursors.has(nextReceiptUid)) break;
      seenCursors.add(nextReceiptUid);

      const page = await fetchWbReceiptsPage({ token, pageSize: activePageSize, nextReceiptUid });
      pagesFetched += 1;

      if (!page.receipts.length && !page.nextReceiptUid && !receiptsByUid.size && pageSizeIndex < pageSizes.length - 1) {
        pageSizeIndex += 1;
        activePageSize = pageSizes[pageSizeIndex];
        nextReceiptUid = '';
        pagesFetched = 0;
        seenCursors.clear();
        sendProgress(`Wildberries: пустая первая страница, пробую размер ${activePageSize}.`, 0, maxPages);
        continue;
      }

      for (const receipt of page.receipts) {
        const key = receipt.receiptUid || receipt.link;
        if (key) receiptsByUid.set(key, receipt);
      }

      sendProgress(`Wildberries: найдено чеков ${receiptsByUid.size}, API-страница ${pagesFetched}.`, pagesFetched, maxPages);
      if (!page.nextReceiptUid) break;
      nextReceiptUid = page.nextReceiptUid;
      if (apiPauseMs > 0) await sleep(apiPauseMs);
    }

    if (!receiptsByUid.size) {
      throw new Error(`Wildberries: чеки не найдены. API-страниц пройдено: ${pagesFetched}. Проверьте вход в аккаунт на /lk/receipts/get.`);
    }

    return {
      receipts: [...receiptsByUid.values()],
      stats: {
        receipts: receiptsByUid.size,
        apiPages: pagesFetched,
        pageSize: activePageSize
      }
    };
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SPEND_COLLECT_SOURCE') return false;

    const options = message.options || {};
    const promise = message.source === 'ozon'
      ? collectOzon({
        maxPages: Math.max(1, Number(options.maxPages) || 1000),
        parsePdf: options.parsePdf !== false,
        pdfConcurrency: options.pdfConcurrency,
        apiPauseMs: Math.max(0, Number(options.apiPauseMs) || 0)
      })
      : collectWildberries({
        maxPages: Math.max(1, Number(options.maxPages) || 2000),
        pageSize: Math.max(1, Math.min(100, Number(options.pageSize) || 10)),
        apiPauseMs: Math.max(0, Number(options.apiPauseMs) || 0)
      });

    promise
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });
})();
