const api = globalThis.chrome;

async function openAppPage() {
  const url = api.runtime.getURL('app.html');
  const tabs = await chromeCall(api.tabs.query, { url }).catch(() => []);
  if (tabs[0]?.id) {
    await chromeCall(api.tabs.update, tabs[0].id, { active: true });
    if (tabs[0].windowId !== undefined) {
      await chromeCall(api.windows.update, tabs[0].windowId, { focused: true }).catch(() => null);
    }
    return;
  }
  await chromeCall(api.tabs.create, { url, active: true });
}

function emitProgress(message, value = null, max = null) {
  try {
    const result = api.runtime.sendMessage({
      type: 'SPEND_PROGRESS',
      message,
      value,
      max
    });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Popup may be closed while collection is still running.
  }
}

function chromeCall(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const err = api.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
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

async function queryTabs(url) {
  return chromeCall(api.tabs.query, { url }).catch(() => []);
}

function isPreferredTab(tab, source, preferredPath) {
  if (source !== 'ozon') return tab.url?.startsWith(preferredPath);
  try {
    const url = new URL(tab.url || '');
    const preferred = new URL(preferredPath);
    return url.hostname.replace(/^www\./, '') === 'ozon.ru'
      && url.pathname.replace(/\/$/, '') === '/my/e-check'
      && url.searchParams.get('archive') === preferred.searchParams.get('archive');
  } catch {
    return false;
  }
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chromeCall(api.tabs.get, tabId).catch(() => null);
    if (tab?.status === 'complete') return tab;
    await sleep(500);
  }

  return chromeCall(api.tabs.get, tabId);
}

async function getOrCreateTab(source) {
  const config = source === 'ozon'
    ? {
      urls: ['https://www.ozon.ru/*', 'https://ozon.ru/*'],
      preferredPath: 'https://www.ozon.ru/my/e-check?archive=1'
    }
    : {
      urls: ['https://www.wildberries.ru/*', 'https://wildberries.ru/*'],
      preferredPath: 'https://www.wildberries.ru/lk/receipts/get'
    };

  for (const pattern of config.urls) {
    const tabs = await queryTabs(pattern);
    const exact = tabs.find((tab) => isPreferredTab(tab, source, config.preferredPath));
    if (exact) {
      return {
        tab: await waitForTabComplete(exact.id),
        created: false
      };
    }
  }

  const tab = await chromeCall(api.tabs.create, {
    url: config.preferredPath,
    active: false
  });
  return {
    tab: await waitForTabComplete(tab.id),
    created: true
  };
}

async function closeManagedTab(managedTab, source) {
  if (!managedTab?.created || !managedTab.tab?.id) return;
  await chromeCall(api.tabs.remove, managedTab.tab.id)
    .then(() => emitProgress(`${source}: временная вкладка закрыта.`))
    .catch(() => null);
}

async function ensureContentScript(tabId) {
  await chromeCall(api.scripting.executeScript, {
    target: { tabId },
    files: ['content.js']
  });
}

async function collectFromTab(source, options) {
  const managedTab = await getOrCreateTab(source);
  const tab = managedTab.tab;
  await ensureContentScript(tab.id);

  const response = await chromeCall(api.tabs.sendMessage, tab.id, {
    type: 'SPEND_COLLECT_SOURCE',
    source,
    options
  });

  if (!response?.ok) {
    throw new Error(response?.error || `${source}: не удалось собрать данные`);
  }

  await closeManagedTab(managedTab, source);
  return response;
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

function decodeHtml(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCharCode(parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

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

function monthFromDate(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function parseWbReceiptItems(html) {
  const items = [];
  const chunks = String(html || '').match(/<div class="products-item[\s\S]*?(?=<div class="products-item|<div class="total"|<\/body>)/gi) || [];

  for (const chunk of chunks) {
    const nameBlock = chunk.match(/<div class="products-cell products-cell_name[\s\S]*?(?=<div class="products-cell products-cell_price)/i)?.[0] || '';
    const cleanNameBlock = nameBlock.replace(/<div class="products-prop-value gray">[\s\S]*?<\/div>/gi, ' ');
    const title = stripTags(cleanNameBlock)
      .replace(/^Наименование\s*/i, '')
      .trim();
    const costBlock = chunk.match(/products-cell_cost[\s\S]*?<div class="products-prop-value">([\s\S]*?)<\/div>/i)?.[1] || '';
    const amount = amountFromText(stripTags(costBlock));

    if (title && amount) {
      items.push({ title, amount });
    }
  }

  return items;
}

function wbReceiptOperationLabel(html) {
  const header = String(html || '').match(/<h2>\s*Кассовый чек\s*<\/h2>([\s\S]{0,1500})/i)?.[1] || String(html || '').slice(0, 12000);
  const text = stripTags(header);
  if (/возврат прихода/i.test(text)) return 'refund';
  if (/приход/i.test(text)) return 'purchase';
  return '';
}

function wbDate(rawDate) {
  const text = String(rawDate || '');
  if (!text) return '';
  return text.replace('T', ' ').replace(/Z$/, '').slice(0, 16);
}

function wbFallbackTitle(receipt) {
  return `Wildberries receipt ${receipt.receiptUid || ''}`.trim();
}

async function recordsFromWbReceipt(receipt) {
  const date = wbDate(receipt.operationDateTime);
  const receiptUrl = receipt.link || '';
  let html = '';
  let items = [];
  let operationLabel = '';

  if (receiptUrl) {
    html = await fetchText(receiptUrl).catch(() => '');
    if (html) {
      items = parseWbReceiptItems(html);
      operationLabel = wbReceiptOperationLabel(html);
    }
  }

  const operationTypeId = Number(receipt.operationTypeId);
  const isReturn = operationTypeId !== 1 || operationLabel === 'refund';
  const type = isReturn ? 'refund' : 'purchase';

  if (!items.length) {
    const amount = Number(receipt.operationSum) || 0;
    return [{
      source: 'wildberries',
      month: monthFromDate(date),
      date,
      amount: (isReturn ? -Math.abs(amount) : amount).toFixed(2),
      currency: receipt.currencyNameIso || 'RUB',
      title: wbFallbackTitle(receipt),
      category: '',
      type,
      is_return: isReturn ? '1' : '0',
      marketplace_id: receipt.receiptUid || '',
      receipt_url: receiptUrl,
      raw_title: `operationTypeId=${receipt.operationTypeId || ''}`,
      raw_amount: String(receipt.operationSum ?? '')
    }];
  }

  return items.map((item) => ({
    source: 'wildberries',
    month: monthFromDate(date),
    date,
    amount: (isReturn ? -Math.abs(item.amount) : item.amount).toFixed(2),
    currency: receipt.currencyNameIso || 'RUB',
    title: item.title,
    category: '',
    type,
    is_return: isReturn ? '1' : '0',
    marketplace_id: receipt.receiptUid || '',
    receipt_url: receiptUrl,
    raw_title: `operationTypeId=${receipt.operationTypeId || ''}`,
    raw_amount: String(item.amount)
  }));
}

async function rowsFromWbReceipts(receipts, concurrencyOption) {
  const concurrency = clampConcurrency(concurrencyOption, 12, 24);
  let completed = 0;
  let itemRows = 0;
  emitProgress(`Wildberries: HTML-разбор в ${concurrency} потоков.`, 0, receipts.length);

  const results = await mapWithConcurrency(receipts, concurrency, async (receipt) => {
    const rows = await recordsFromWbReceipt(receipt);
    completed += 1;
    itemRows += rows.length;
    if (completed === receipts.length || completed % 5 === 0) {
      emitProgress(
        `Wildberries: чеки ${completed}/${receipts.length}, строк ${itemRows}.`,
        completed,
        receipts.length
      );
    }
    return rows;
  });

  return results.flat();
}

async function collectSpend({ sources, options }) {
  const rows = [];
  const warnings = [];
  const stats = {};
  const jobs = [];

  if (sources.includes('ozon')) {
    jobs.push((async () => {
      emitProgress('Ozon: открываю вкладку и собираю чеки...', 0, sources.length);
      const result = await collectFromTab('ozon', {
        maxPages: options.ozonMaxPages,
        parsePdf: options.ozonParsePdf !== false,
        pdfConcurrency: options.ozonPdfConcurrency,
        apiPauseMs: options.ozonApiPauseMs
      });
      return {
        source: 'ozon',
        rows: result.rows || [],
        stats: result.stats || {}
      };
    })());
  }

  if (sources.includes('wildberries')) {
    jobs.push((async () => {
      emitProgress('Wildberries: открываю вкладку и собираю чеки...', 0, sources.length);
      const result = await collectFromTab('wildberries', {
        maxPages: options.wbMaxPages,
        pageSize: options.wbPageSize,
        apiPauseMs: options.wbApiPauseMs
      });
      return {
        source: 'wildberries',
        rows: await rowsFromWbReceipts(result.receipts || [], options.wbReceiptConcurrency),
        stats: result.stats || {}
      };
    })());
  }

  const results = await Promise.all(jobs.map((job) => job
    .then((result) => ({ ok: true, result }))
    .catch((error) => ({ ok: false, error }))));

  for (const item of results) {
    if (item.ok) {
      rows.push(...item.result.rows);
      stats[item.result.source] = item.result.stats;
    } else {
      warnings.push(item.error.message);
    }
  }

  if (!rows.length && warnings.length) {
    throw new Error(warnings.join('; '));
  }

  return { rows, warnings, stats };
}

api.action.onClicked.addListener(() => {
  openAppPage().catch(() => {});
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SPEND_GET_COOKIE') {
    chromeCall(api.cookies.get, {
      url: message.url,
      name: message.name
    })
      .then((cookie) => sendResponse({ ok: true, value: cookie?.value || '' }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'SPEND_OPEN_APP') {
    openAppPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type !== 'SPEND_COLLECT') return false;

  collectSpend({
    sources: Array.isArray(message.sources) ? message.sources : [],
    options: message.options || {}
  })
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
