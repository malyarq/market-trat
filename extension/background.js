const api = globalThis.chrome;
const collectJobs = new Map();
let nextCollectJobId = 1;

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

const progressSourceLabels = {
  ozon: 'Ozon',
  wildberries: 'Wildberries',
  yandex: 'Яндекс Маркет'
};

async function trackSourceProgress(source, work) {
  try {
    const result = await work();
    emitProgress(`${progressSourceLabels[source]}: готово, строк ${(result.rows || []).length}.`);
    return {
      source,
      rows: result.rows || [],
      stats: result.stats || {}
    };
  } catch (error) {
    emitProgress(`${progressSourceLabels[source]}: ошибка: ${error.message}`);
    throw error;
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
  if (source === 'yandex') {
    try {
      const url = new URL(tab.url || '');
      return url.hostname === 'market.yandex.ru'
        && url.pathname === '/my/orders'
        && url.searchParams.get('filter') === 'COMPLETED';
    } catch {
      return false;
    }
  }
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
  const configs = {
    ozon: {
      urls: ['https://www.ozon.ru/*', 'https://ozon.ru/*'],
      preferredPath: 'https://www.ozon.ru/my/e-check?archive=1'
    },
    wildberries: {
      urls: ['https://www.wildberries.ru/*', 'https://wildberries.ru/*'],
      preferredPath: 'https://www.wildberries.ru/lk/receipts/get'
    },
    yandex: {
      urls: ['https://market.yandex.ru/*'],
      preferredPath: 'https://market.yandex.ru/my/orders?filter=COMPLETED'
    }
  };
  const config = configs[source];
  if (!config) throw new Error(`${source}: неизвестный источник`);

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
  try {
    const response = await chromeCall(api.tabs.sendMessage, tab.id, {
      type: 'SPEND_COLLECT_SOURCE',
      source,
      options
    });

    if (!response?.ok) {
      throw new Error(response?.error || `${source}: не удалось собрать данные`);
    }

    return response;
  } finally {
    await closeManagedTab(managedTab, source);
  }
}

async function collectFromTabKeepOpen(source, options) {
  const managedTab = await getOrCreateTab(source);
  const tab = managedTab.tab;
  await ensureContentScript(tab.id);
  const response = await chromeCall(api.tabs.sendMessage, tab.id, {
    type: 'SPEND_COLLECT_SOURCE',
    source,
    options
  });

  if (!response?.ok) {
    await closeManagedTab(managedTab, source);
    throw new Error(response?.error || `${source}: не удалось собрать данные`);
  }

  return { response, managedTab };
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

    if (title && amount && !isWbServiceItemTitle(title)) {
      items.push({ title, amount, itemIndex: items.length + 1 });
    }
  }

  return items;
}

function isWbServiceItemTitle(title) {
  return /^(услуга доставки|комиссия сервиса)$/i.test(String(title || '').trim());
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
      item_index: '1',
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
    item_index: String(item.itemIndex || ''),
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

const yandexReceiptsResolver = 'src/resolvers/orderDocuments/resolveOrderReceiptsByOrderId:resolveOrderReceiptsByOrderId';

function yandexResultData(json, index) {
  return json?.results?.[index]?.data || (index === 0 ? json?.data : {}) || {};
}

function parseYandexReceiptsData(data, orderId) {
  const collection = data.collections?.orderReceipt || {};
  const ids = Array.isArray(data.result) ? data.result : [];
  return ids
    .map((id) => collection[id] || collection[String(id)])
    .filter((receipt) => receipt?.fiscalUrl)
    .map((receipt) => ({
      orderId,
      id: receipt.id || '',
      type: receipt.type || '',
      createdAt: receipt.createdAt || 0,
      fiscalUrl: receipt.fiscalUrl
    }));
}

function yandexRetryDelay(retryAfterValue, attempt) {
  const retryAfter = Number(retryAfterValue);
  if (Number.isFinite(retryAfter) && retryAfter > 60) {
    throw new Error(`Yandex resolve 429: лимит Яндекса, повторите примерно через ${Math.ceil(retryAfter / 60)} мин`);
  }
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(15000, retryAfter * 1000);
  return Math.min(15000, 1500 * (2 ** attempt));
}

async function fetchYandexResolve(tabId, headers, params, path, pauseMs = 0) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (pauseMs > 0 && attempt === 0) await sleep(pauseMs);

    const [execution] = await chromeCall(api.scripting.executeScript, {
      target: { tabId },
      world: 'MAIN',
      func: async (resolver, clientHeaders, requestParams, requestPath) => {
        function decodeHtml(text) {
          return String(text || '')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');
        }

        function headerValue(html, key) {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return decodeHtml(html).match(new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`))?.[1] || '';
        }

        const html = document.documentElement?.innerHTML || '';
        const url = new URL('/api/resolve/', location.origin);
        url.searchParams.set('r', resolver);
        const retpath = new URL(requestPath, location.origin).href;
        const detectedHeaders = {
          'x-market-apphost-target': 'WEB',
          'x-market-core-service': '<UNKNOWN>',
          'x-market-page-id': /^\/my\/order\/\d+/.test(requestPath)
            ? 'market:order'
            : headerValue(html, 'page') || 'market:orders'
        };
        const sk = headerValue(html, 'sk');
        const version = headerValue(html, '-version') || headerValue(html, 'version');
        const frontGlue = headerValue(html, 'marketFrontGlue');
        if (sk) detectedHeaders.sk = sk;
        if (version) detectedHeaders['x-market-app-version'] = version;
        if (frontGlue) detectedHeaders['x-market-front-glue'] = frontGlue;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(url.toString(), {
            method: 'POST',
            credentials: 'include',
            referrer: retpath,
            signal: controller.signal,
            headers: {
              accept: '*/*',
              'content-type': 'application/json',
              ...(clientHeaders || {}),
              ...detectedHeaders,
              'x-requested-with': 'XMLHttpRequest',
              'x-retpath-y': retpath
            },
            body: JSON.stringify({
              params: requestParams,
              path: requestPath
            })
          });

          return {
            ok: response.ok,
            status: response.status,
            retryAfter: response.headers.get('retry-after') || '',
            text: await response.text()
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            retryAfter: '',
            text: '',
            error: error.name === 'AbortError' ? 'Yandex resolve timeout 20s' : error.message
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      args: [yandexReceiptsResolver, headers || {}, params, path]
    });
    const response = execution?.result || {};

    if (response.ok) {
      if (!response.text) throw new Error(`Yandex resolve ${response.status}: empty response`);
      try {
        return JSON.parse(response.text);
      } catch {
        throw new Error(`Yandex resolve ${response.status}: ${response.text.slice(0, 120) || 'bad JSON'}`);
      }
    }

    if (response.status !== 429 || attempt === 2) {
      throw new Error(response.error || `Yandex resolve ${response.status}`);
    }
    const delay = yandexRetryDelay(response.retryAfter, attempt);
    emitProgress(`Яндекс Маркет: 429, пауза ${Math.round(delay / 1000)}с.`);
    await sleep(delay);
  }

  throw new Error('Yandex resolve failed');
}

async function fetchYandexReceiptOrder(tabId, headers, orderId, archived, pauseMs) {
  const json = await fetchYandexResolve(
    tabId,
    headers,
    [{ orderId: Number(orderId), archived }],
    `/my/order/${orderId}`,
    pauseMs
  );
  return {
    orderId,
    archived,
    receipts: parseYandexReceiptsData(yandexResultData(json, 0), orderId)
  };
}

async function fetchYandexReceiptOrderSafe(tabId, headers, orderId, pauseMs) {
  let firstError = '';
  try {
    const active = await fetchYandexReceiptOrder(tabId, headers, orderId, false, pauseMs);
    if (active.receipts.length) return active;
  } catch (error) {
    firstError = error.message;
    if (/429|лимит Яндекса|timeout/i.test(firstError)) return { orderId, receipts: [], error: firstError };
  }

  try {
    return await fetchYandexReceiptOrder(tabId, headers, orderId, true, pauseMs);
  } catch (error) {
    return {
      orderId,
      receipts: [],
      error: [firstError, error.message].filter(Boolean).join('; ')
    };
  }
}

async function collectYandexReceipts(metadata, options = {}) {
  if (!options.tabId) throw new Error('Яндекс Маркет: вкладка для получения чеков закрыта.');
  const ids = [...new Set(metadata.orderIds || [])];
  const headers = metadata.headers || {};
  const receiptsByUrl = new Map();
  const failedByOrder = new Map();
  let archivedOrders = 0;
  let noReceiptOrders = 0;
  let completed = 0;
  const concurrency = clampConcurrency(options.receiptConcurrency, 1, 2);
  const pauseMs = Math.max(0, Number(options.apiPauseMs) || 0);
  emitProgress(`Яндекс Маркет: получаю ссылки на чеки в ${concurrency} потоков, заказов ${ids.length}.`, 0, ids.length);

  await mapWithConcurrency(ids, concurrency, async (orderId) => {
    const result = await fetchYandexReceiptOrderSafe(options.tabId, headers, orderId, pauseMs);
    if (result.error) {
      failedByOrder.set(result.orderId, result.error);
    } else if (!result.receipts.length) {
      noReceiptOrders += 1;
    } else {
      if (result.archived) archivedOrders += 1;
      for (const receipt of result.receipts) receiptsByUrl.set(receipt.fiscalUrl, receipt);
      failedByOrder.delete(result.orderId);
    }
    completed += 1;
    if (completed === ids.length || completed % 20 === 0) {
      emitProgress(`Яндекс Маркет: чеки ${completed}/${ids.length}, ссылок ${receiptsByUrl.size}.`, completed, ids.length);
    }
  });

  const failedOrders = [...failedByOrder.entries()]
    .map(([orderId, error]) => `${orderId}: ${String(error).trim()}`);

  if (!receiptsByUrl.size) {
    const details = failedOrders.slice(0, 3).join('; ');
    throw new Error(`Яндекс Маркет: ссылки на чеки не найдены. Заказов проверено: ${ids.length}.${details ? ` Ошибки: ${details}.` : ''}`);
  }

  return {
    receipts: [...receiptsByUrl.values()],
    stats: {
      orders: ids.length,
      receipts: receiptsByUrl.size,
      archivedOrders,
      noReceiptOrders,
      failedOrders: failedOrders.length,
      failedOrderSamples: failedOrders.slice(0, 10)
    }
  };
}

function parseYandexDate(rawDate, fallbackMs = 0) {
  const match = String(rawDate || '').match(/(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2]}-${match[1]} ${match[4]}:${match[5]}`;
  }

  const date = new Date(Number(fallbackMs) || 0);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-') + ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeYandexText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function yandexSettlementKind(text) {
  const normalized = normalizeYandexText(text);
  if (/полны[ий]\s+расчет/.test(normalized)) return 'full';
  if (/предоплат|аванс/.test(normalized)) return 'prepayment';
  return '';
}

function parseYandexReceiptItems(html) {
  const table = String(html || '').match(/<table[^>]+class="receipt-table"[\s\S]*?<\/table>/i)?.[0] || '';
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const items = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 6 || !/^\d+\.$/.test(stripTags(cells[0]))) continue;

    const title = stripTags(String(cells[1]).split(/<br\s*\/?>/i)[0]).trim();
    const amount = amountFromText(stripTags(cells[cells.length - 1]));
    if (!title || !amount || isYandexServiceItemTitle(title)) continue;
    items.push({
      title,
      amount,
      itemIndex: items.length + 1,
      settlementKind: yandexSettlementKind(cells[1])
    });
  }

  return items;
}

function isYandexServiceItemTitle(title) {
  return /^(доставк.*|сервисный сбор|работа сервиса)$/i.test(String(title || '').trim());
}

function yandexReceiptDate(html, receipt) {
  const dateRow = String(html || '').match(/Смена\s+N[\s\S]*?<\/tr>/i)?.[0] || '';
  return parseYandexDate(stripTags(dateRow), receipt.createdAt);
}

function isYandexReturnReceipt(html, receipt) {
  const header = stripTags(String(html || '').match(/<div[^>]+class="header"[\s\S]*?<\/div>/i)?.[0] || '');
  return /возврат/i.test(header) || /RETURN|REFUND/i.test(receipt.type || '');
}

function yandexReceiptId(url) {
  try {
    const parsed = new URL(url);
    return ['fn', 'fpd', 'n'].map((key) => parsed.searchParams.get(key) || '').join(':');
  } catch {
    return url || '';
  }
}

function rowsFromYandexReceiptHtml(receipt, html) {
  const date = yandexReceiptDate(html, receipt);
  const isReturn = isYandexReturnReceipt(html, receipt);
  const items = parseYandexReceiptItems(html);

  return items.map((item) => ({
    source: 'yandex',
    month: monthFromDate(date),
    date,
    amount: (isReturn ? -Math.abs(item.amount) : item.amount).toFixed(2),
    currency: 'RUB',
    title: item.title,
    category: '',
    type: isReturn ? 'refund' : 'purchase',
    is_return: isReturn ? '1' : '0',
    marketplace_id: `${receipt.orderId || ''}:${receipt.id || yandexReceiptId(receipt.fiscalUrl)}`,
    item_index: String(item.itemIndex || ''),
    receipt_url: receipt.fiscalUrl || '',
    raw_title: `orderId=${receipt.orderId || ''} receiptType=${receipt.type || ''}`,
    raw_amount: String(item.amount),
    __yandexOrderId: String(receipt.orderId || ''),
    __yandexSettlementKind: item.settlementKind || ''
  }));
}

function yandexAmountCents(value) {
  return Math.round(amountFromText(value) * 100);
}

function yandexDedupKey(row) {
  return [
    row.__yandexOrderId || row.marketplace_id || '',
    normalizeYandexText(row.title),
    Math.abs(yandexAmountCents(row.amount)),
    Math.sign(yandexAmountCents(row.amount))
  ].join('\u0001');
}

function filterYandexRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = yandexDedupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const filtered = [];
  let prepaymentRowsDropped = 0;

  for (const group of groups.values()) {
    const hasFull = group.some((row) => row.__yandexSettlementKind === 'full');
    for (const row of group) {
      if (hasFull && row.__yandexSettlementKind === 'prepayment') {
        prepaymentRowsDropped += 1;
        continue;
      }
      filtered.push(row);
    }
  }

  return {
    rows: filtered.map(({ __yandexOrderId, __yandexSettlementKind, ...row }) => row),
    prepaymentRowsDropped
  };
}

async function rowsFromYandexReceipts(receipts, concurrencyOption) {
  const concurrency = clampConcurrency(concurrencyOption, 4, 8);
  const failed = [];
  let completed = 0;
  let parsedReceipts = 0;
  emitProgress(`Яндекс Маркет: HTML-разбор в ${concurrency} потоков.`, 0, receipts.length);

  async function fetchYandexReceiptHtml(url) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fetchText(url);
      } catch (error) {
        if (!/^429\b/.test(error.message) || attempt === 2) throw error;
        await sleep(1500 * (attempt + 1));
      }
    }
    return '';
  }

  const results = await mapWithConcurrency(receipts, concurrency, async (receipt) => {
    try {
      const html = await fetchYandexReceiptHtml(receipt.fiscalUrl);
      const rows = rowsFromYandexReceiptHtml(receipt, html);
      if (rows.length) parsedReceipts += 1;
      else failed.push({ receipt, reason: 'no_items' });
      return rows;
    } catch (error) {
      failed.push({ receipt, reason: error.message });
      return [];
    } finally {
      completed += 1;
      if (completed === receipts.length || completed % 5 === 0) {
        emitProgress(`Яндекс Маркет: чеки ${completed}/${receipts.length}, разобрано ${parsedReceipts}, ошибок ${failed.length}.`, completed, receipts.length);
      }
    }
  });

  const filtered = filterYandexRows(results.flat());
  if (filtered.prepaymentRowsDropped) {
    emitProgress(`Яндекс Маркет: отброшено дублей предоплаты ${filtered.prepaymentRowsDropped}.`, receipts.length, receipts.length);
  }

  return {
    rows: filtered.rows,
    stats: {
      receipts: receipts.length,
      parsedReceipts,
      failedReceipts: failed.length,
      itemRows: filtered.rows.length,
      prepaymentRowsDropped: filtered.prepaymentRowsDropped,
      failedReceiptSamples: failed.slice(0, 10).map((item) => `${item.receipt.orderId || item.receipt.fiscalUrl || ''}: ${item.reason}`)
    }
  };
}

async function collectSpend({ sources, options }) {
  const rows = [];
  const warnings = [];
  const stats = {};
  const jobs = [];
  const knownReceipts = options.knownReceipts || {};
  const knownReceiptTail = options.knownReceiptTail;

  if (sources.includes('ozon')) {
    jobs.push(trackSourceProgress('ozon', async () => {
      emitProgress('Ozon: открываю вкладку и собираю чеки...', 0, sources.length);
      const result = await collectFromTab('ozon', {
        maxPages: options.ozonMaxPages,
        parsePdf: options.ozonParsePdf !== false,
        pdfConcurrency: options.ozonPdfConcurrency,
        apiPauseMs: options.ozonApiPauseMs,
        knownReceipts: knownReceipts.ozon || [],
        knownReceiptTail
      });
      return {
        rows: result.rows || [],
        stats: result.stats || {}
      };
    }));
  }

  if (sources.includes('wildberries')) {
    jobs.push(trackSourceProgress('wildberries', async () => {
      emitProgress('Wildberries: открываю вкладку и собираю чеки...', 0, sources.length);
      const result = await collectFromTab('wildberries', {
        maxPages: options.wbMaxPages,
        pageSize: options.wbPageSize,
        apiPauseMs: options.wbApiPauseMs,
        knownReceipts: knownReceipts.wildberries || [],
        knownReceiptTail
      });
      return {
        rows: await rowsFromWbReceipts(result.receipts || [], options.wbReceiptConcurrency),
        stats: result.stats || {}
      };
    }));
  }

  if (sources.includes('yandex')) {
    jobs.push(trackSourceProgress('yandex', async () => {
      emitProgress('Яндекс Маркет: открываю вкладку и собираю чеки...', 0, sources.length);
      const { response: metadata, managedTab } = await collectFromTabKeepOpen('yandex', {
        maxPages: options.yandexMaxPages,
        receiptConcurrency: options.yandexReceiptConcurrency,
        apiPauseMs: options.yandexApiPauseMs,
        metadataOnly: true,
        knownOrderIds: knownReceipts.yandexOrders || [],
        knownReceiptTail
      });
      try {
        const result = await collectYandexReceipts(metadata, {
          tabId: managedTab.tab.id,
          receiptConcurrency: options.yandexReceiptConcurrency,
          apiPauseMs: options.yandexApiPauseMs
        });
        const parsed = await rowsFromYandexReceipts(result.receipts || [], 4);
        return {
          rows: parsed.rows,
          stats: {
            ...(metadata.stats || {}),
            ...(result.stats || {}),
            ...(parsed.stats || {})
          }
        };
      } finally {
        await closeManagedTab(managedTab, 'yandex');
      }
    }));
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

function startCollectJob(sources, options) {
  const jobId = String(nextCollectJobId++);
  const job = {
    status: 'running',
    result: null,
    error: ''
  };
  collectJobs.set(jobId, job);

  collectSpend({ sources, options })
    .then((result) => {
      job.status = 'done';
      job.result = result;
    })
    .catch((error) => {
      job.status = 'error';
      job.error = error.message;
    });

  return jobId;
}

if (api?.action?.onClicked) {
  api.action.onClicked.addListener(() => {
    openAppPage().catch(() => {});
  });
}

if (api?.runtime?.onMessage) {
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

    if (message?.type === 'SPEND_COLLECT_START') {
      try {
        const jobId = startCollectJob(
          Array.isArray(message.sources) ? message.sources : [],
          message.options || {}
        );
        sendResponse({ ok: true, jobId });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return false;
    }

    if (message?.type === 'SPEND_COLLECT_STATUS') {
      const job = collectJobs.get(String(message.jobId || ''));
      if (!job) {
        sendResponse({ ok: false, error: 'Задача сбора не найдена. Запустите сбор заново.' });
        return false;
      }
      if (job.status === 'done') {
        collectJobs.delete(String(message.jobId));
        sendResponse({ ok: true, status: 'done', ...job.result });
        return false;
      }
      if (job.status === 'error') {
        collectJobs.delete(String(message.jobId));
        sendResponse({ ok: true, status: 'error', error: job.error });
        return false;
      }
      sendResponse({ ok: true, status: 'running' });
      return false;
    }

    if (message?.type !== 'SPEND_COLLECT') return false;

    const jobId = startCollectJob(
      Array.isArray(message.sources) ? message.sources : [],
      message.options || {}
    );
    sendResponse({ ok: true, jobId });
    return false;
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseWbReceiptItems,
    filterYandexRows,
    rowsFromYandexReceiptHtml
  };
}
