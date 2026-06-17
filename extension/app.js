const api = globalThis.chrome;

const csvColumns = [
  { header: 'date', field: 'date' },
  { header: 'marketplace', field: 'source' },
  { header: 'title', field: 'title' },
  { header: 'amount', field: 'amount' },
  { header: 'currency', field: 'currency' },
  { header: 'category', field: 'category' }
];

const els = {
  sourceOzon: document.getElementById('sourceOzon'),
  sourceWb: document.getElementById('sourceWb'),
  sourceYandex: document.getElementById('sourceYandex'),
  collect: document.getElementById('collect'),
  themeToggle: document.getElementById('themeToggle'),
  runSummary: document.getElementById('runSummary'),
  runSummaryText: document.getElementById('runSummaryText'),
  runDownloadCsv: document.getElementById('runDownloadCsv'),
  toggleRunDetails: document.getElementById('toggleRunDetails'),
  runDetails: document.getElementById('runDetails'),
  uploadCsv: document.getElementById('uploadCsv'),
  uploadCsvInput: document.getElementById('uploadCsvInput'),
  downloadCsv: document.getElementById('downloadCsv'),
  copyLog: document.getElementById('copyLog'),
  clearLog: document.getElementById('clearLog'),
  warningBanner: document.getElementById('warningBanner'),
  updateBanner: document.getElementById('updateBanner'),
  qualitySummary: document.getElementById('qualitySummary'),
  statusText: document.getElementById('statusText'),
  progress: document.getElementById('progress'),
  sourceStatuses: document.getElementById('sourceStatuses'),
  periodGroup: document.getElementById('periodGroup'),
  dateFrom: document.getElementById('dateFrom'),
  dateTo: document.getElementById('dateTo'),
  resetPeriod: document.getElementById('resetPeriod'),
  quickPeriodSelect: document.getElementById('quickPeriodSelect'),
  quickPeriodButtons: [...document.querySelectorAll('.quick-period')],
  tabButtons: [...document.querySelectorAll('.tab-button')],
  viewPanels: [...document.querySelectorAll('.view-panel')],
  analyticsOzon: document.getElementById('analyticsOzon'),
  analyticsWb: document.getElementById('analyticsWb'),
  analyticsYandex: document.getElementById('analyticsYandex'),
  activeFilters: document.getElementById('activeFilters'),
  analyticsEmpty: document.querySelector('.analytics-empty'),
  analyticsTotal: document.getElementById('analyticsTotal'),
  analyticsTotalCompare: document.getElementById('analyticsTotalCompare'),
  analyticsAverage: document.getElementById('analyticsAverage'),
  analyticsAverageLabel: document.getElementById('analyticsAverageLabel'),
  analyticsPurchases: document.getElementById('analyticsPurchases'),
  analyticsPurchasesLabel: document.getElementById('analyticsPurchasesLabel'),
  analyticsRefunds: document.getElementById('analyticsRefunds'),
  chartRange: document.getElementById('chartRange'),
  periodChart: document.getElementById('periodChart'),
  sourceBreakdown: document.getElementById('sourceBreakdown'),
  categoryBreakdown: document.getElementById('categoryBreakdown'),
  categorySummary: document.getElementById('categorySummary'),
  categoryChartType: document.getElementById('categoryChartType'),
  detailTitle: document.getElementById('detailTitle'),
  detailSummary: document.getElementById('detailSummary'),
  detailSearch: document.getElementById('detailSearch'),
  detailPageSize: document.getElementById('detailPageSize'),
  detailMore: document.getElementById('detailMore'),
  clearDetailFilter: document.getElementById('clearDetailFilter'),
  detailRows: document.getElementById('detailRows'),
  topItems: document.getElementById('topItems'),
  logBadge: document.getElementById('logBadge'),
  log: document.getElementById('log')
};

const cpuCount = navigator.hardwareConcurrency || 8;
const defaultCollectOptions = {
  ozonMaxPages: 1000,
  wbMaxPages: 2000,
  wbPageSize: 100,
  yandexMaxPages: 200,
  ozonParsePdf: true,
  ozonPdfConcurrency: Math.min(12, Math.max(8, cpuCount)),
  wbReceiptConcurrency: Math.min(24, Math.max(12, cpuCount * 2)),
  yandexReceiptConcurrency: 2,
  ozonApiPauseMs: 0,
  wbApiPauseMs: 0,
  yandexApiPauseMs: 300
};

const logStorageKey = 'markettrat-log-v1';
const themeStorageKey = 'markettrat-theme-v1';
const categoryChartTypeStorageKey = 'markettrat-category-chart-v1';
const sourceLabels = {
  ozon: 'Ozon',
  wildberries: 'Wildberries',
  yandex: 'Яндекс Маркет'
};
const sourceColors = {
  ozon: '#005bff',
  wildberries: '#cb11ab',
  yandex: '#f2c200'
};
const sourceMarks = {
  ozon: 'O',
  wildberries: 'WB',
  yandex: 'Я'
};
const collectSourceInputs = [
  ['ozon', els.sourceOzon],
  ['wildberries', els.sourceWb],
  ['yandex', els.sourceYandex]
];
const periodUnitLabels = {
  day: 'среднее за день',
  week: 'среднее за неделю',
  month: 'среднее за месяц',
  year: 'среднее за год'
};
const categoryLabels = {
  unknown: 'Без категории'
};
const categoryColors = {
  'Авто': '#f97316',
  'Аксессуары': '#64748b',
  'Благотворительность': '#10b981',
  'Бытовая химия': '#14b8a6',
  'Бытовая техника': '#0ea5e9',
  'Доставка': '#94a3b8',
  'Дом': '#8b5cf6',
  'Детям': '#ec4899',
  'Здоровье': '#22c55e',
  'Зоотовары': '#a16207',
  'Интимные товары': '#be123c',
  'Канцтовары': '#64748b',
  'Книги': '#0ea5e9',
  'Красота и уход': '#d946ef',
  'Одежда': '#06b6d4',
  'Обувь': '#6366f1',
  'Пакеты и упаковка': '#78716c',
  'Подписки': '#7c3aed',
  'Продукты': '#84cc16',
  'Ремонт': '#eab308',
  'Сад': '#16a34a',
  'Спорт': '#ef4444',
  'Хобби и творчество': '#a855f7',
  'Электроника': '#3b82f6',
  'Игрушки': '#f59e0b',
  other: '#475467',
  unknown: '#94a3b8'
};
const svgNamespace = 'http://www.w3.org/2000/svg';
const amountFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
let rows = [];
let absorbedRefunds = [];
let csvText = '';
let logLines = loadStoredLog();
let hasCollected = false;
let selectedPeriodKey = '';
let categoriesExpanded = false;
let detailFilter = null;
let collectStatuses = {};
let runDetailsOpen = true;
let lastRunAt = null;
let lastRunKind = '';
let lastWarningCount = 0;
let detailShownCount = 60;
const logLineByKey = new Map();
let logRenderScheduled = false;

function callChrome(fn, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof fn !== 'function') {
      reject(new Error('Откройте страницу из иконки установленного расширения.'));
      return;
    }

    fn(...args, (result) => {
      const err = api?.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCollectJob(jobId) {
  while (true) {
    await sleep(1000);
    const response = await callChrome(api.runtime.sendMessage, {
      type: 'SPEND_COLLECT_STATUS',
      jobId
    });
    if (!response?.ok) throw new Error(response?.error || 'Не удалось получить статус сбора.');
    if (response.status === 'done') return response;
    if (response.status === 'error') throw new Error(response.error || 'Не удалось собрать данные.');
  }
}

function loadStoredLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(logStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-500).map(String) : [];
  } catch {
    return [];
  }
}

function storeLog() {
  try {
    localStorage.setItem(logStorageKey, JSON.stringify(logLines.slice(-500)));
  } catch {
    // Log persistence is best effort; collection must not depend on it.
  }
}

function renderLog() {
  logRenderScheduled = false;
  els.log.textContent = logLines.join('\n');
  els.log.scrollTop = els.log.scrollHeight;
  updateLogBadge();
  storeLog();
}

function scheduleRenderLog() {
  if (logRenderScheduled) return;
  logRenderScheduled = true;
  requestAnimationFrame(renderLog);
}

function loadTheme() {
  const saved = localStorage.getItem(themeStorageKey);
  return saved === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggle.textContent = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  localStorage.setItem(themeStorageKey, theme);
  updateAnalytics();
}

function setActiveView(view) {
  for (const button of els.tabButtons) {
    button.classList.toggle('active', button.dataset.view === view);
  }
  for (const panel of els.viewPanels) {
    panel.classList.toggle('active', panel.id === `${view}View`);
  }
}

function updateLogBadge() {
  const count = logLines.filter((line) => /Ошибка|Предупреждение/.test(line)).length;
  els.logBadge.hidden = count === 0;
  els.logBadge.textContent = String(count);
}

function createSourceBadge(source) {
  const badge = document.createElement('span');
  badge.className = `source-badge ${source}`;
  badge.style.background = sourceColors[source] || '#005bff';
  badge.textContent = sourceMarks[source] || String(source || '').slice(0, 2).toUpperCase();
  return badge;
}

function makeClickable(node, activate) {
  node.classList.add('clickable');
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.addEventListener('click', activate);
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
}

function sourceFromProgress(text) {
  const value = String(text || '');
  if (value.startsWith('Ozon:')) return 'ozon';
  if (value.startsWith('Wildberries:')) return 'wildberries';
  if (value.startsWith('Яндекс Маркет:')) return 'yandex';
  return '';
}

function collectStatusFromProgress(text) {
  const value = String(text || '');
  if (/^[^:]+: готово(?:[,. ]|$)/.test(value)) return { state: 'done', label: 'готово' };
  if (/^[^:]+: ошибка(?:[,. ]|$)/.test(value)) return { state: 'error', label: 'ошибка' };
  return { state: 'running', label: 'собирается' };
}

function renderSourceStatuses() {
  clearNode(els.sourceStatuses);
  const entries = Object.entries(collectStatuses);
  els.sourceStatuses.hidden = entries.length === 0;

  for (const [source, status] of entries) {
    const item = document.createElement('span');
    item.className = `source-status ${status.state || 'waiting'}`;
    if (status.title) item.title = status.title;
    item.append(createSourceBadge(source), document.createTextNode(status.label || 'ожидает'));
    els.sourceStatuses.appendChild(item);
  }
}

function setCollectStatuses(sources, state, label) {
  collectStatuses = Object.fromEntries(sources.map((source) => [source, { state, label }]));
  renderSourceStatuses();
}

function setCollectStatus(source, state, label, title = '') {
  if (!source || !collectStatuses[source]) return;
  collectStatuses[source] = { state, label, title };
  renderSourceStatuses();
}

function updateCsvButton() {
  const text = 'Скачать весь CSV';
  els.downloadCsv.disabled = rows.length === 0;
  els.downloadCsv.textContent = text;
  els.runDownloadCsv.disabled = rows.length === 0;
  els.runDownloadCsv.textContent = text;
}

function formatRunTime(date) {
  return date
    ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
}

function renderRunSummary() {
  const show = rows.length > 0 && lastRunAt;
  els.runSummary.hidden = !show;
  els.runDetails.classList.toggle('collapsed', show && !runDetailsOpen);
  els.runDownloadCsv.hidden = show && runDetailsOpen;
  els.toggleRunDetails.textContent = runDetailsOpen ? 'Скрыть детали' : 'Подробнее';
  if (!show) return;

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const warnings = lastWarningCount ? ` · предупреждения: ${lastWarningCount}` : '';
  els.runSummaryText.textContent = `${lastRunKind}: ${rows.length} строк · ${formatRub(total)}${warnings} · ${formatRunTime(lastRunAt)}`;
}

function finishRun(kind, warningCount = 0) {
  lastRunAt = new Date();
  lastRunKind = kind;
  lastWarningCount = warningCount;
  runDetailsOpen = false;
  renderRunSummary();
}

function appendLog(text, key = '') {
  const stamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  const line = `[${stamp}] ${text}`;
  if (key && logLineByKey.has(key)) {
    const index = logLineByKey.get(key);
    if (index >= 0 && index < logLines.length) {
      logLines[index] = line;
      scheduleRenderLog();
      return;
    }
  }

  logLines.push(line);
  if (key) logLineByKey.set(key, logLines.length - 1);

  const trimmedCount = Math.max(0, logLines.length - 500);
  if (trimmedCount) logLines = logLines.slice(trimmedCount);
  if (logLineByKey.size) {
    for (const [savedKey, index] of logLineByKey) {
      const shiftedIndex = index - trimmedCount;
      if (shiftedIndex >= 0 && shiftedIndex < logLines.length) logLineByKey.set(savedKey, shiftedIndex);
      else logLineByKey.delete(savedKey);
    }
  }
  scheduleRenderLog();
}

function progressLogKey(text) {
  const value = String(text || '');
  if (/^Ozon: найдено \d+, API-страница/.test(value)) return 'ozon-api';
  if (/^Ozon: PDF \d+\/\d+/.test(value)) return 'ozon-pdf';
  if (/^Wildberries: найдено чеков \d+, API-страница/.test(value)) return 'wb-api';
  if (/^Wildberries: чеки \d+\/\d+/.test(value)) return 'wb-html';
  if (/^Яндекс Маркет: найдено заказов/.test(value)) return 'yandex-orders';
  if (/^Яндекс Маркет: чеки \d+\/\d+.*ссылок/.test(value)) return 'yandex-links';
  if (/^Яндекс Маркет: чеки \d+\/\d+/.test(value)) return 'yandex-html';
  if (/^Яндекс Маркет: 429/.test(value)) return 'yandex-429';
  if (/^Яндекс Маркет: batch /.test(value)) return 'yandex-batch';
  return '';
}

function selectedCollectSources() {
  return collectSourceInputs
    .filter(([, input]) => input.checked)
    .map(([source]) => source);
}

function updateProgressFill() {
  const colors = selectedCollectSources().map((source) => sourceColors[source]);
  els.progress.style.setProperty(
    '--progress-fill',
    colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : (colors[0] || 'var(--primary)')
  );
}

function setStatus(text, progressValue = null, progressMax = null) {
  els.statusText.textContent = text;
  const unknownApiPages = progressMax !== null
    && progressMax >= 1000
    && /API-страница/.test(text);

  if (unknownApiPages) {
    els.progress.removeAttribute('value');
    els.progress.max = 1;
    return;
  }

  if (progressMax !== null) els.progress.max = progressMax;
  if (progressValue !== null) els.progress.value = progressValue;
  else if (!els.progress.hasAttribute('value')) els.progress.value = 0;
}

function showWarnings(warnings = []) {
  const visibleWarnings = warnings.filter(Boolean).map(String);
  els.warningBanner.hidden = visibleWarnings.length === 0;
  els.warningBanner.title = visibleWarnings.length ? 'Открыть технический лог' : '';
  els.warningBanner.textContent = visibleWarnings.length
    ? `Часть данных не собрана: ${visibleWarnings.join('; ')}. Нажмите, чтобы открыть лог.`
    : '';
}

function showUpdateBanner(version) {
  clearNode(els.updateBanner);
  const text = document.createElement('span');
  text.textContent = `Доступна версия ${version}.`;
  const link = document.createElement('a');
  link.href = globalThis.MarketTratUpdate.latestReleaseUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Скачать обновление';
  els.updateBanner.append(text, link);
  els.updateBanner.hidden = false;
}

async function checkForUpdate() {
  const update = globalThis.MarketTratUpdate;
  const current = api?.runtime?.getManifest?.().version || '';
  if (!update || !current) return;

  try {
    const response = await fetch(update.releaseApiUrl, {
      cache: 'no-store',
      headers: { accept: 'application/vnd.github+json' }
    });
    if (!response.ok) return;

    const release = await response.json();
    const latest = update.normalizeVersion(release.tag_name || release.name);
    if (latest && update.isNewerVersion(latest, current)) showUpdateBanner(latest);
  } catch {
    // Update checks are best effort; the extension works offline.
  }
}

async function loadCategoryRulePack() {
  const update = globalThis.MarketTratUpdate;
  const setRules = globalThis.setSpendCategoryRules;
  if (typeof setRules !== 'function') return;

  let payload = null;
  try {
    const response = await fetch(update.categoryPackApiUrl, {
      cache: 'no-store',
      headers: { accept: 'application/vnd.github+json' }
    });
    if (response.ok) payload = update.parseGithubContentJson(await response.json());
  } catch {
    // Remote category packs are best effort; local rules still work.
  }

  if (!payload) {
    try {
      const localUrl = api?.runtime?.getURL?.('category-rules.json');
      if (localUrl) {
        const response = await fetch(localUrl, { cache: 'no-store' });
        if (response.ok) payload = await response.json();
      }
    } catch {
      // Missing local pack is fine.
    }
  }

  const count = payload ? setRules(payload) : 0;
  if (!count || !rows.length) return;

  rows = rows.map(withCategory);
  csvText = makeCsv(rows);
  updateCsvButton();
  updateAnalytics();
  renderRunSummary();
}

function unreadReceiptCount(stats = {}) {
  return ['ozon', 'yandex'].reduce((sum, source) => {
    const item = stats[source] || {};
    const receipts = Number(item.receipts) || 0;
    const parsed = Number(item.parsedReceipts) || 0;
    return sum + Math.max(0, receipts - parsed);
  }, 0);
}

function renderQualitySummary(rawRecords = [], stats = {}, cleaningStats = {}, warnings = []) {
  clearNode(els.qualitySummary);
  const hasAnything = rawRecords.length || rows.length || warnings.length;
  els.qualitySummary.hidden = !hasAnything;
  if (!hasAnything) return;

  const parts = [
    `CSV: ${formatCount(rows.length, ['строка', 'строки', 'строк'])}`,
    `исходно: ${formatCount(rawRecords.length, ['строка', 'строки', 'строк'])}`
  ];
  if (cleaningStats.refundRowsAbsorbed) {
    parts.push(`возвраты: ${formatRub(cleaningStats.refundAmountAbsorbed)}`);
  }
  if (cleaningStats.serviceRowsDropped) {
    parts.push(`служебные строки: ${cleaningStats.serviceRowsDropped}`);
  }
  const unread = unreadReceiptCount(stats);
  if (unread) parts.push(`не прочитано чеков: ${unread}`);
  if (warnings.length) parts.push(`предупреждения: ${warnings.length}`);

  for (const part of parts) {
    const item = document.createElement('span');
    item.textContent = part;
    els.qualitySummary.appendChild(item);
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeCsv(records) {
  const lines = [csvColumns.map((column) => column.header).join(',')];
  for (const record of records) {
    lines.push(csvColumns.map((column) => csvCell(record[column.field])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function withCategory(row) {
  const category = String(row.category || '').trim();
  const guessed = globalThis.guessSpendCategory?.(row.title) || 'unknown';
  return {
    ...row,
    category: !category || category.toLowerCase() === 'unknown' ? guessed : category
  };
}

function categoryName(category) {
  return categoryLabels[category] || category || categoryLabels.unknown;
}

function categoryColor(category) {
  return categoryColors[category] || categoryColors.unknown;
}

function loadCategoryChartType() {
  const saved = localStorage.getItem(categoryChartTypeStorageKey);
  return saved === 'donut' || saved === 'tiles' ? saved : 'bars';
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToAmount(value) {
  return (value / 100).toFixed(2);
}

function normalizeKeyText(text) {
  return String(text || '')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function orderKey(row) {
  const rawTitleMatch = String(row?.raw_title || '').match(/Заказ №(\S+)/);
  if (rawTitleMatch) return rawTitleMatch[1];
  const receiptId = String(row?.receipt_url || '').match(/[?&]id=([^&]+)/)?.[1] || row?.marketplace_id || '';
  const idPrefixMatch = String(receiptId).match(/^(.+?)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d+-\d+)?$/i);
  if (idPrefixMatch) return idPrefixMatch[1];
  return '';
}

function returnMatchKey(row, includeOrder) {
  return [
    row.source || '',
    includeOrder ? orderKey(row) : '',
    normalizeKeyText(row.title)
  ].join('\u0001');
}

function absorbReturns(records) {
  const positives = [];
  const refunds = [];
  const stats = {
    refundRowsAbsorbed: 0,
    refundRowsUnmatched: 0,
    refundAmountAbsorbed: 0,
    refundAmountAbsorbedBySource: {},
    refundsAbsorbed: []
  };

  for (const record of records) {
    const amountCents = cents(record.amount);
    if (amountCents < 0) {
      refunds.push({ row: record, remaining: Math.abs(amountCents) });
    } else if (amountCents > 0) {
      positives.push({ row: { ...record }, remaining: amountCents });
    }
  }

  const positivesByOrder = new Map();
  const positivesByTitle = new Map();

  for (const item of positives) {
    for (const [map, includeOrder] of [[positivesByOrder, true], [positivesByTitle, false]]) {
      const key = returnMatchKey(item.row, includeOrder);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
  }

  const sortedRefunds = refunds.sort((a, b) => String(a.row.date).localeCompare(String(b.row.date)));

  for (const refund of sortedRefunds) {
    let absorbedForRefund = 0;

    for (const includeOrder of [true, false]) {
      if (!refund.remaining) break;
      const map = includeOrder ? positivesByOrder : positivesByTitle;
      const candidates = (map.get(returnMatchKey(refund.row, includeOrder)) || [])
        .filter((item) => item.remaining > 0)
        .sort((a, b) => String(b.row.date).localeCompare(String(a.row.date)));

      for (const candidate of candidates) {
        if (!refund.remaining) break;
        const absorbed = Math.min(candidate.remaining, refund.remaining);
        candidate.remaining -= absorbed;
        refund.remaining -= absorbed;
        stats.refundAmountAbsorbed += absorbed;
        absorbedForRefund += absorbed;
        stats.refundAmountAbsorbedBySource[refund.row.source] = (
          stats.refundAmountAbsorbedBySource[refund.row.source] || 0
        ) + absorbed;
      }
    }

    if (absorbedForRefund) stats.refundsAbsorbed.push({ ...refund.row, amount: absorbedForRefund });
    if (refund.remaining) stats.refundRowsUnmatched += 1;
    else stats.refundRowsAbsorbed += 1;
  }

  const rows = positives
    .filter((item) => item.remaining > 0)
    .map((item) => ({
      ...item.row,
      amount: centsToAmount(item.remaining)
    }));

  return {
    rows,
    stats: {
      ...stats,
      refundAmountAbsorbed: stats.refundAmountAbsorbed / 100,
      refundsAbsorbed: stats.refundsAbsorbed.map((item) => ({
        ...item,
        amount: item.amount / 100
      })),
      refundAmountAbsorbedBySource: Object.fromEntries(
        Object.entries(stats.refundAmountAbsorbedBySource).map(([source, amount]) => [source, amount / 100])
      )
    }
  };
}

function isServiceRow(row) {
  const title = String(row.title || '').trim();
  if (row.source === 'wildberries') return /^(услуга доставки|комиссия сервиса)$/i.test(title);
  if (row.source === 'yandex') return /^(доставк.*|сервисный сбор|работа сервиса)$/i.test(title);
  return false;
}

function logParserStats(stats = {}) {
  const ozon = stats.ozon || {};
  const wb = stats.wildberries || {};
  const yandex = stats.yandex || {};
  const dropped = (ozon.duplicateRowsDropped || 0)
    + (ozon.prepaymentRowsDropped || 0)
    + (ozon.operationalRowsDropped || 0)
    + (ozon.adjustmentRowsDropped || 0);
  const ozonParts = [`${ozon.parsedReceipts || 0} / ${ozon.receipts || 0}`];
  if (ozon.itemRows) ozonParts.push(`строк ${ozon.itemRows}`);
  if (dropped) ozonParts.push(`отброшено ${dropped}`);
  if (ozon.deliveryRowsFolded) ozonParts.push(`доставка распределена ${ozon.deliveryRowsFolded}`);
  if (ozon.deliveryRowsDropped) ozonParts.push(`доставка удалена ${ozon.deliveryRowsDropped}`);
  if (ozon.receipts || ozon.itemRows || dropped || ozon.deliveryRowsFolded || ozon.deliveryRowsDropped) {
    appendLog(`Debug Ozon: PDF ${ozonParts.join(', ')}.`, 'debug-ozon-stats');
  }
  if (wb.receipts) {
    appendLog(`Debug Wildberries: чеков ${wb.receipts}.`, 'debug-wb-stats');
  }
  if (yandex.receipts || yandex.itemRows) {
    const parts = [`чеков ${yandex.parsedReceipts || 0} / ${yandex.receipts || 0}`];
    if (yandex.orders) parts.push(`заказов ${yandex.orders}`);
    if (yandex.archivedOrders) parts.push(`архивных ${yandex.archivedOrders}`);
    if (yandex.noReceiptOrders) parts.push(`без чеков ${yandex.noReceiptOrders}`);
    if (yandex.failedOrders) parts.push(`ошибок заказов ${yandex.failedOrders}`);
    if (yandex.itemRows) parts.push(`строк ${yandex.itemRows}`);
    if (yandex.prepaymentRowsDropped) parts.push(`предоплат отброшено ${yandex.prepaymentRowsDropped}`);
    appendLog(`Debug Яндекс Маркет: ${parts.join(', ')}.`, 'debug-yandex-stats');
    if (yandex.failedOrderSamples?.length) {
      appendLog(`Debug Яндекс заказы: ${yandex.failedOrderSamples.join(' | ')}`, 'debug-yandex-order-errors');
    }
    if (yandex.failedReceiptSamples?.length) {
      appendLog(`Debug Яндекс чеки: ${yandex.failedReceiptSamples.join(' | ')}`, 'debug-yandex-receipt-errors');
    }
  }
  if (stats.cleaning?.serviceRowsDropped) {
    appendLog(`Debug: служебных строк удалено ${stats.cleaning.serviceRowsDropped}.`, 'debug-cleaning-stats');
  }
}

function formatRub(value) {
  return `${amountFormatter.format(value || 0)} ₽`;
}

function pluralRu(count, forms) {
  const value = Math.abs(Number(count) || 0);
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function formatCount(count, forms) {
  return `${count} ${pluralRu(count, forms)}`;
}

function compactAmount(value) {
  const abs = Math.abs(value || 0);
  if (abs >= 1000000) return `${amountFormatter.format(value / 1000000)}M`;
  if (abs >= 1000) return `${amountFormatter.format(value / 1000)}K`;
  return amountFormatter.format(value);
}

function parseRowDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoWeekKey(date) {
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = shifted.getUTCDay() || 7;
  shifted.setUTCDate(shifted.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((shifted - yearStart) / 86400000) + 1) / 7);
  return `${shifted.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodKey(date, group) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (group === 'day') return `${year}-${month}-${day}`;
  if (group === 'week') return isoWeekKey(date);
  if (group === 'year') return String(year);
  return `${year}-${month}`;
}

function selectedAnalyticsSources() {
  const sources = new Set();
  if (els.analyticsOzon.checked) sources.add('ozon');
  if (els.analyticsWb.checked) sources.add('wildberries');
  if (els.analyticsYandex.checked) sources.add('yandex');
  return sources;
}

function selectedAnalyticsSourceNames(sources = selectedAnalyticsSources()) {
  return [...sources].map((source) => sourceLabels[source] || source);
}

function resetAnalyticsFilters() {
  els.periodGroup.value = 'month';
  els.dateFrom.value = '';
  els.dateTo.value = '';
  els.quickPeriodSelect.value = 'all';
  els.detailSearch.value = '';
  els.analyticsOzon.checked = true;
  els.analyticsWb.checked = true;
  els.analyticsYandex.checked = true;
  selectedPeriodKey = '';
  detailFilter = null;
  resetDetailPaging();
  syncDateInputs();
  updateAnalytics();
}

function detailFilterName() {
  if (!detailFilter) return '';
  if (detailFilter.type === 'period') return `детали: ${detailFilter.key}`;
  if (detailFilter.type === 'source') return `детали: ${sourceLabels[detailFilter.source] || detailFilter.source}`;
  if (detailFilter.type === 'refunds') return 'детали: возвраты';
  if (detailFilter.type === 'category' || detailFilter.type === 'categories') {
    return `детали: ${detailFilter.label || categoryName(detailFilter.category)}`;
  }
  if (detailFilter.type === 'item') return `детали: ${detailFilter.label || detailFilter.title}`;
  return '';
}

function renderActiveFilters(sources) {
  clearNode(els.activeFilters);
  const period = els.dateFrom.value || els.dateTo.value
    ? `${els.dateFrom.value || 'начало'} - ${els.dateTo.value || 'сегодня'}`
    : 'весь период';
  const sourceNames = selectedAnalyticsSourceNames(sources);
  const parts = [
    `Период: ${period}`,
    `Источники: ${sourceNames.length ? sourceNames.join(', ') : 'нет'}`,
    `Группировка: ${els.periodGroup.options[els.periodGroup.selectedIndex]?.textContent || els.periodGroup.value}`
  ];
  const detail = detailFilterName();
  if (detail) parts.push(detail);
  const search = els.detailSearch.value.trim();
  if (search) parts.push(`поиск: ${search}`);

  for (const part of parts) {
    const item = document.createElement('span');
    item.textContent = part;
    els.activeFilters.appendChild(item);
  }

  const hasFilters = period !== 'весь период'
    || sourceNames.length !== 3
    || els.periodGroup.value !== 'month'
    || detailFilter
    || search;
  if (hasFilters) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'secondary';
    reset.textContent = 'Сбросить';
    reset.addEventListener('click', resetAnalyticsFilters);
    els.activeFilters.appendChild(reset);
  }
}

function dateInputValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function inputDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function localInputDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function setDateRange(from, to) {
  els.dateFrom.value = from || '';
  els.dateTo.value = to || '';
  syncDateInputs();
  updateAnalytics();
}

function applyQuickPeriod(period) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  selectedPeriodKey = '';
  detailFilter = null;
  resetDetailPaging();
  if (els.quickPeriodSelect.value !== period) els.quickPeriodSelect.value = period || 'all';

  if (period === 'this-month') {
    setDateRange(localInputDate(new Date(year, month, 1)), localInputDate(new Date(year, month + 1, 0)));
  } else if (period === 'prev-month') {
    setDateRange(localInputDate(new Date(year, month - 1, 1)), localInputDate(new Date(year, month, 0)));
  } else if (period === 'this-year') {
    setDateRange(`${year}-01-01`, `${year}-12-31`);
  } else {
    setDateRange('', '');
  }
}

function periodBounds(key, group) {
  if (group === 'day') return { from: key, to: key };
  if (group === 'month') {
    const match = String(key).match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    return {
      from: inputDate(new Date(Date.UTC(year, month, 1))),
      to: inputDate(new Date(Date.UTC(year, month + 1, 0)))
    };
  }
  if (group === 'year') return { from: `${key}-01-01`, to: `${key}-12-31` };
  if (group === 'week') {
    const match = String(key).match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: inputDate(monday), to: inputDate(sunday) };
  }
  return null;
}

function selectChartPeriod(key) {
  const range = periodBounds(key, els.periodGroup.value);
  if (!range) return;
  selectedPeriodKey = key;
  setDateRange(range.from, range.to);
}

function selectedDateRange() {
  return {
    from: dateInputValue(els.dateFrom.value),
    to: dateInputValue(els.dateTo.value)
  };
}

function isDateInRange(date, range) {
  const time = date.getTime();
  return (range.from === null || time >= range.from)
    && (range.to === null || time <= range.to);
}

function syncDateInputs() {
  if (els.dateFrom.value && els.dateTo.value && els.dateFrom.value > els.dateTo.value) {
    els.dateTo.value = els.dateFrom.value;
  }
  els.dateFrom.max = els.dateTo.value || els.dateFrom.dataset.max || '';
  els.dateTo.min = els.dateFrom.value || els.dateTo.dataset.min || '';
}

function updateDateInputBounds() {
  const dates = rows
    .map((row) => parseRowDate(row.date))
    .filter(Boolean)
    .map((date) => date.toISOString().slice(0, 10))
    .sort();
  const min = dates[0] || '';
  const max = dates[dates.length - 1] || '';

  for (const input of [els.dateFrom, els.dateTo]) {
    input.dataset.min = min;
    input.dataset.max = max;
    input.min = min;
    input.max = max;
    if (input.value && ((min && input.value < min) || (max && input.value > max))) input.value = '';
  }
  syncDateInputs();
}

function selectedRefundTotal(sources, range) {
  return selectedRefundRows(sources, range).reduce((sum, refund) => sum + (Number(refund.amount) || 0), 0);
}

function selectedRefundRows(sources, range) {
  return absorbedRefunds.filter((refund) => {
    if (!sources.has(refund.source)) return false;
    const date = parseRowDate(refund.date);
    return date && isDateInRange(date, range);
  });
}

function totalForRange(sources, range) {
  return rows.reduce((sum, row) => {
    if (!sources.has(row.source)) return sum;
    const date = parseRowDate(row.date);
    if (!date || !isDateInRange(date, range)) return sum;
    return sum + (Number(row.amount) || 0);
  }, 0);
}

function previousRange(range) {
  if (range.from === null || range.to === null) return null;
  const dayMs = 86400000;
  const days = Math.max(1, Math.round((range.to - range.from) / dayMs) + 1);
  const to = range.from - dayMs;
  return {
    from: to - ((days - 1) * dayMs),
    to
  };
}

function compareText(current, previous) {
  if (!previous && !current) return '';
  if (!previous) return current ? 'новые траты' : '';
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (!percent) return 'как в прошлом периоде';
  return `${percent > 0 ? '+' : ''}${percent}% к прошлому периоду`;
}

function buildAnalyticsData(sources, group) {
  const range = selectedDateRange();
  const records = [];
  const periods = new Map();

  let total = 0;
  for (const row of rows) {
    if (!sources.has(row.source)) continue;
    const date = parseRowDate(row.date);
    if (!date) continue;
    if (!isDateInRange(date, range)) continue;

    const key = periodKey(date, group);
    if (!periods.has(key)) {
      periods.set(key, {
        key,
        total: 0,
        expenses: 0,
        refunds: 0,
        rows: 0,
        bySource: {}
      });
    }
    const item = periods.get(key);
    const amount = Number(row.amount) || 0;
    records.push(row);
    total += amount;
    item.total += amount;
    item.bySource[row.source] = (item.bySource[row.source] || 0) + amount;
    if (amount >= 0) item.expenses += amount;
    else item.refunds += Math.abs(amount);
    item.rows += 1;
  }

  return {
    records,
    range,
    total,
    periods: [...periods.values()].sort((a, b) => a.key.localeCompare(b.key))
  };
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function svgEl(name, attrs = {}, text = '') {
  const node = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function renderPeriodChart(periods) {
  const svg = els.periodChart;
  clearNode(svg);

  const width = 960;
  const height = 300;
  const margin = { top: 18, right: 22, bottom: 44, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const mutedColor = cssVar('--muted', '#6b7280');
  const borderColor = cssVar('--border', '#e5e7eb');
  const borderStrongColor = cssVar('--border-strong', '#9ca3af');
  const dangerColor = cssVar('--danger', '#dc2626');

  if (!periods.length) {
    svg.appendChild(svgEl('text', {
      x: width / 2,
      y: height / 2,
      'text-anchor': 'middle',
      fill: mutedColor,
      'font-size': 14
    }, 'Нет данных для выбранной выборки'));
    return;
  }

  const values = periods.map((item) => item.total);
  let maxValue = Math.max(0, ...values);
  let minValue = Math.min(0, ...values);
  if (maxValue === minValue) {
    maxValue += 1;
    minValue -= 1;
  }

  const yFor = (value) => margin.top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
  const baseline = yFor(0);

  for (let index = 0; index <= 4; index += 1) {
    const value = minValue + ((maxValue - minValue) * index) / 4;
    const y = yFor(value);
    svg.appendChild(svgEl('line', {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
      stroke: value === 0 ? borderStrongColor : borderColor,
      'stroke-width': value === 0 ? 1.4 : 1
    }));
    svg.appendChild(svgEl('text', {
      x: margin.left - 10,
      y: y + 4,
      'text-anchor': 'end',
      fill: mutedColor,
      'font-size': 11
    }, compactAmount(value)));
  }

  const slot = plotWidth / periods.length;
  const barWidth = Math.max(3, Math.min(42, slot * 0.68));
  const labelStep = Math.max(1, Math.ceil(periods.length / 9));

  periods.forEach((item, index) => {
    const center = margin.left + slot * index + slot / 2;
    const barX = center - barWidth / 2;
    const barAttrs = {
      class: 'chart-bar',
      role: 'button',
      tabindex: 0,
      'aria-label': `${item.key}: ${formatRub(item.total)}`
    };
    const activate = () => {
      detailFilter = { type: 'period', key: item.key };
      selectChartPeriod(item.key);
      scrollDetailsIntoView();
    };
    const onKeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    };
    const sourceEntries = Object.entries(item.bySource || {})
      .filter(([, amount]) => amount > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    const tooltipParts = sourceEntries.map(([source, amount]) => {
      const share = item.total ? Math.round((amount / item.total) * 100) : 0;
      return `${sourceLabels[source] || source} ${share}% (${formatRub(amount)})`;
    });
    const title = `${item.key}: ${formatRub(item.total)}${tooltipParts.length ? `\n${tooltipParts.join('\n')}` : ''}`;

    if (item.total <= 0 || !sourceEntries.length) {
      const y = yFor(item.total);
      const rect = svgEl('rect', {
        ...barAttrs,
        x: barX,
        y: item.total >= 0 ? y : baseline,
        width: barWidth,
        height: Math.max(1, Math.abs(baseline - y)),
        rx: 3,
        fill: dangerColor,
        stroke: selectedPeriodKey === item.key ? borderStrongColor : 'none',
        'stroke-width': selectedPeriodKey === item.key ? 2 : 0
      });
      rect.addEventListener('click', activate);
      rect.addEventListener('keydown', onKeydown);
      rect.appendChild(svgEl('title', {}, title));
      svg.appendChild(rect);
    } else {
      let stacked = 0;
      for (const [source, amount] of sourceEntries) {
        const yTop = yFor(stacked + amount);
        const yBottom = yFor(stacked);
        const rect = svgEl('rect', {
          ...barAttrs,
          x: barX,
          y: yTop,
          width: barWidth,
          height: Math.max(1, yBottom - yTop),
          rx: 3,
          fill: sourceColors[source] || '#2563eb',
          stroke: selectedPeriodKey === item.key ? borderStrongColor : 'none',
          'stroke-width': selectedPeriodKey === item.key ? 2 : 0
        });
        rect.addEventListener('click', activate);
        rect.addEventListener('keydown', onKeydown);
        rect.appendChild(svgEl('title', {}, title));
        svg.appendChild(rect);
        stacked += amount;
      }
    }

    if (index % labelStep === 0 || index === periods.length - 1) {
      svg.appendChild(svgEl('text', {
        x: center,
        y: height - 18,
        'text-anchor': 'middle',
        fill: mutedColor,
        'font-size': 11
      }, item.key));
    }
  });
}

function renderSourceBreakdown(records) {
  clearNode(els.sourceBreakdown);
  const totals = new Map();
  for (const row of records) {
    totals.set(row.source, (totals.get(row.source) || 0) + (Number(row.amount) || 0));
  }

  const entries = [...totals.entries()]
    .filter(([, total]) => total !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Нет данных';
    els.sourceBreakdown.appendChild(empty);
    return;
  }

  const max = Math.max(...entries.map(([, total]) => Math.abs(total)), 1);
  for (const [source, total] of entries) {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const label = document.createElement('div');
    label.className = 'breakdown-label';
    const name = document.createElement('span');
    name.className = 'source-label';
    name.append(createSourceBadge(source), document.createTextNode(sourceLabels[source] || source));
    const amount = document.createElement('strong');
    amount.textContent = formatRub(total);
    label.append(name, amount);

    const bar = document.createElement('div');
    bar.className = 'breakdown-bar';
    const fill = document.createElement('div');
    fill.className = 'breakdown-fill';
    fill.style.width = `${Math.max(3, Math.abs(total) / max * 100)}%`;
    fill.style.background = total >= 0 ? (sourceColors[source] || '#2563eb') : '#dc2626';
    bar.appendChild(fill);

    row.append(label, bar);
    makeClickable(row, () => setDetailFilter({ type: 'source', source }, true));
    els.sourceBreakdown.appendChild(row);
  }
}

function buildCategoryBreakdown(records) {
  const totals = new Map();
  let total = 0;

  for (const row of records) {
    const amount = Number(row.amount) || 0;
    if (amount <= 0) continue;
    const category = row.category || 'unknown';
    const current = totals.get(category) || {
      category,
      amount: 0,
      count: 0
    };
    current.amount += amount;
    current.count += 1;
    totals.set(category, current);
    total += amount;
  }

  return {
    total,
    entries: [...totals.values()].sort((a, b) => b.amount - a.amount)
  };
}

function categoryMetaText(item, total) {
  const percent = total ? Math.round((item.amount / total) * 100) : 0;
  return `${formatRub(item.amount)} · ${percent}% · ${formatCount(item.count, ['покупка', 'покупки', 'покупок'])}`;
}

function scrollDetailsIntoView() {
  requestAnimationFrame(() => {
    els.detailTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setDetailFilter(filter, scroll = false) {
  detailFilter = filter;
  resetDetailPaging();
  updateAnalytics();
  if (scroll) scrollDetailsIntoView();
}

function categoryDrillFilter(item) {
  return item.categories?.length
    ? { type: 'categories', categories: item.categories, label: item.label }
    : { type: 'category', category: item.category, label: item.label || categoryName(item.category) };
}

function createCategoryRow(item, total, max, showBar) {
  const row = document.createElement('div');
  row.className = 'category-row';
  row.style.setProperty('--category-color', categoryColor(item.category));

  const head = document.createElement('div');
  head.className = 'category-head';

  const title = document.createElement('span');
  title.className = 'category-title';
  const swatch = document.createElement('span');
  swatch.className = 'category-swatch';
  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = item.label || categoryName(item.category);
  title.append(swatch, name);

  const meta = document.createElement('span');
  meta.className = 'category-meta';
  meta.textContent = categoryMetaText(item, total);
  head.append(title, meta);
  row.appendChild(head);

  if (showBar) {
    const bar = document.createElement('div');
    bar.className = 'category-bar';
    const fill = document.createElement('div');
    fill.className = 'category-fill';
    fill.style.width = `${Math.max(3, (item.amount / max) * 100)}%`;
    bar.appendChild(fill);
    row.appendChild(bar);
  }

  makeClickable(row, () => setDetailFilter(categoryDrillFilter(item), true));
  return row;
}

function renderCategoryBars(entries, total) {
  const strip = document.createElement('div');
  strip.className = 'category-strip';
  for (const item of entries) {
    const percent = total ? (item.amount / total) * 100 : 0;
    const segment = document.createElement('span');
    segment.className = 'category-strip-segment';
    segment.style.width = `${Math.max(2, percent)}%`;
    segment.style.background = categoryColor(item.category);
    segment.title = `${item.label || categoryName(item.category)}: ${Math.round(percent)}%`;
    segment.setAttribute('aria-label', `Показать покупки: ${item.label || categoryName(item.category)}`);
    makeClickable(segment, () => setDetailFilter(categoryDrillFilter(item), true));
    strip.appendChild(segment);
  }
  els.categoryBreakdown.appendChild(strip);

  const max = Math.max(...entries.map((item) => item.amount), 1);
  for (const item of entries) {
    els.categoryBreakdown.appendChild(createCategoryRow(item, total, max, true));
  }
}

function renderCategoryDonut(entries, total) {
  const wrap = document.createElement('div');
  wrap.className = 'category-donut-layout';
  const chart = svgEl('svg', {
    class: 'category-donut',
    viewBox: '0 0 160 160',
    role: 'img',
    'aria-label': 'Доли расходов по категориям'
  });
  chart.appendChild(svgEl('circle', {
    cx: 80,
    cy: 80,
    r: 54,
    fill: 'none',
    stroke: 'var(--border)',
    'stroke-width': 24
  }));

  const circumference = 2 * Math.PI * 54;
  let offset = 0;
  for (const item of entries) {
    const length = total ? (item.amount / total) * circumference : 0;
    const circle = svgEl('circle', {
      cx: 80,
      cy: 80,
      r: 54,
      fill: 'none',
      stroke: categoryColor(item.category),
      'stroke-width': 24,
      'stroke-dasharray': `${length} ${circumference - length}`,
      'stroke-dashoffset': -offset,
      transform: 'rotate(-90 80 80)'
    });
    circle.appendChild(svgEl('title', {}, `${item.label || categoryName(item.category)}: ${categoryMetaText(item, total)}`));
    chart.appendChild(circle);
    offset += length;
  }
  chart.appendChild(svgEl('text', {
    x: 80,
    y: 75,
    'text-anchor': 'middle',
    fill: 'currentColor',
    'font-size': 12,
    'font-weight': 700
  }, 'Всего'));
  chart.appendChild(svgEl('text', {
    x: 80,
    y: 94,
    'text-anchor': 'middle',
    fill: 'currentColor',
    'font-size': 14,
    'font-weight': 800
  }, compactAmount(total)));

  const legend = document.createElement('div');
  legend.className = 'category-donut-legend';
  const max = Math.max(...entries.map((item) => item.amount), 1);
  for (const item of entries) legend.appendChild(createCategoryRow(item, total, max, false));
  wrap.append(chart, legend);
  els.categoryBreakdown.appendChild(wrap);
}

function renderCategoryTiles(entries, total) {
  const grid = document.createElement('div');
  grid.className = 'category-tiles';
  for (const item of entries) {
    const tile = document.createElement('div');
    tile.className = 'category-tile';
    tile.style.setProperty('--category-color', categoryColor(item.category));
    const name = document.createElement('strong');
    name.textContent = item.label || categoryName(item.category);
    const amount = document.createElement('span');
    amount.textContent = formatRub(item.amount);
    const meta = document.createElement('small');
    meta.textContent = `${total ? Math.round((item.amount / total) * 100) : 0}% · ${formatCount(item.count, ['покупка', 'покупки', 'покупок'])}`;
    tile.append(name, amount, meta);
    grid.appendChild(tile);
  }
  els.categoryBreakdown.appendChild(grid);
}

function renderCategoryBreakdown(records) {
  clearNode(els.categoryBreakdown);
  const { entries, total } = buildCategoryBreakdown(records);

  els.categorySummary.textContent = entries.length ? formatCount(entries.length, ['категория', 'категории', 'категорий']) : '';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Нет покупок в выборке';
    els.categoryBreakdown.appendChild(empty);
    return;
  }

  const tail = entries.slice(7);
  const visible = categoriesExpanded ? [...entries] : entries.slice(0, 7);
  if (tail.length && !categoriesExpanded) {
    visible.push({
      category: 'other',
      label: 'Остальное',
      categories: tail.map((item) => item.category),
      amount: tail.reduce((sum, item) => sum + item.amount, 0),
      count: tail.reduce((sum, item) => sum + item.count, 0)
    });
  }

  const chartType = els.categoryChartType.value;
  if (chartType === 'donut') renderCategoryDonut(visible, total);
  else if (chartType === 'tiles') renderCategoryTiles(visible, total);
  else renderCategoryBars(visible, total);

  if (tail.length) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'secondary category-toggle';
    toggle.textContent = categoriesExpanded
      ? 'Свернуть категории'
      : `Показать остальные ${formatCount(tail.length, ['категорию', 'категории', 'категорий'])}`;
    toggle.addEventListener('click', () => {
      categoriesExpanded = !categoriesExpanded;
      updateAnalytics();
    });
    els.categoryBreakdown.appendChild(toggle);
  }
}

function buildTopItems(records) {
  const totals = new Map();
  for (const row of records) {
    const amount = Number(row.amount) || 0;
    const title = String(row.title || '').trim();
    if (amount <= 0 || !title) continue;
    const key = `${row.source}\u0001${title}`;
    const current = totals.get(key) || {
      title,
      source: row.source,
      category: row.category || 'unknown',
      amount: 0,
      count: 0,
      firstDate: row.date,
      lastDate: row.date
    };
    current.amount += amount;
    current.count += 1;
    if (String(row.date).localeCompare(String(current.firstDate)) < 0) current.firstDate = row.date;
    if (String(row.date).localeCompare(String(current.lastDate)) > 0) current.lastDate = row.date;
    totals.set(key, current);
  }

  return [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
}

function shortDate(value) {
  return String(value || '').slice(0, 10);
}

function topItemMeta(item) {
  const dates = shortDate(item.firstDate) === shortDate(item.lastDate)
    ? shortDate(item.firstDate)
    : `${shortDate(item.firstDate)} - ${shortDate(item.lastDate)}`;
  const repeats = item.count > 1 ? `, ${formatCount(item.count, ['покупка', 'покупки', 'покупок'])}` : '';
  return `${sourceLabels[item.source] || item.source}, ${dates}${repeats}`;
}

function renderTopItems(records) {
  clearNode(els.topItems);
  const items = buildTopItems(records);
  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Нет покупок в выборке';
    els.topItems.appendChild(empty);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'top-item';
    const text = document.createElement('span');
    text.className = 'top-item-text';
    const title = document.createElement('span');
    title.className = 'source-label top-item-title';
    const titleText = document.createElement('span');
    titleText.className = 'top-item-name';
    titleText.textContent = item.title;
    title.append(createSourceBadge(item.source), titleText);
    title.title = `${sourceLabels[item.source] || item.source}: ${item.title}`;
    const meta = document.createElement('span');
    meta.className = 'top-item-meta';
    meta.textContent = topItemMeta(item);
    const category = document.createElement('span');
    category.className = 'category-pill';
    category.style.setProperty('--category-color', categoryColor(item.category));
    category.textContent = categoryName(item.category);
    text.append(title, meta, category);
    const amount = document.createElement('strong');
    amount.className = 'top-item-amount';
    amount.textContent = formatRub(item.amount);
    li.append(text, amount);
    makeClickable(li, () => setDetailFilter({
      type: 'item',
      source: item.source,
      title: item.title,
      label: item.title
    }, true));
    els.topItems.appendChild(li);
  }
}

function matchesDetailFilter(row, group) {
  if (!detailFilter) return true;
  if (detailFilter.type === 'refunds') return true;
  if (detailFilter.type === 'source') return row.source === detailFilter.source;
  if (detailFilter.type === 'category') return row.category === detailFilter.category;
  if (detailFilter.type === 'categories') return detailFilter.categories.includes(row.category);
  if (detailFilter.type === 'item') {
    return row.source === detailFilter.source
      && normalizeKeyText(row.title) === normalizeKeyText(detailFilter.title);
  }
  if (detailFilter.type === 'period') {
    const date = parseRowDate(row.date);
    return date && periodKey(date, group) === detailFilter.key;
  }
  return true;
}

function detailPageSize() {
  return els.detailPageSize.value === 'all' ? Infinity : (Number(els.detailPageSize.value) || 60);
}

function resetDetailPaging() {
  detailShownCount = detailPageSize();
}

function renderDetails(records, group) {
  clearNode(els.detailRows);
  const query = normalizeKeyText(els.detailSearch.value);
  const isRefundDetails = detailFilter?.type === 'refunds';
  const detailRecords = isRefundDetails
    ? selectedRefundRows(selectedAnalyticsSources(), selectedDateRange())
    : records;
  const filtered = detailRecords
    .filter((row) => matchesDetailFilter(row, group))
    .filter((row) => !query || normalizeKeyText(row.title).includes(query))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const limit = Math.min(detailShownCount, filtered.length);
  const shown = filtered.slice(0, limit);

  els.detailTitle.textContent = detailFilter ? detailFilterName().replace(/^детали: /, 'Детали: ') : 'Детали покупок';
  els.detailSummary.textContent = filtered.length
    ? `${formatCount(filtered.length, isRefundDetails ? ['возврат', 'возврата', 'возвратов'] : ['покупка', 'покупки', 'покупок'])}${filtered.length > shown.length ? ` · показано ${shown.length}` : ''}`
    : '';
  els.clearDetailFilter.hidden = !detailFilter && !query;
  els.detailMore.hidden = filtered.length <= shown.length;
  els.detailMore.textContent = `Показать ещё ${Math.min(detailPageSize(), filtered.length - shown.length)}`;

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = isRefundDetails
      ? 'Нет возвратов в выборке'
      : (records.length ? 'Нет покупок для выбранной детализации' : 'Нет покупок в выборке');
    els.detailRows.appendChild(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'detail-row header';
  for (const text of ['Дата', 'Источник', 'Товар', 'Категория', 'Сумма']) {
    const cell = document.createElement('span');
    cell.textContent = text;
    header.appendChild(cell);
  }
  els.detailRows.appendChild(header);

  for (const row of shown) {
    const item = document.createElement('div');
    item.className = 'detail-row';

    const date = document.createElement('span');
    date.textContent = shortDate(row.date);

    const source = document.createElement('span');
    source.className = 'source-label';
    source.append(createSourceBadge(row.source), document.createTextNode(sourceLabels[row.source] || row.source));

    const title = document.createElement('span');
    title.className = 'detail-title';
    title.textContent = row.title || '';
    title.title = row.title || '';

    const category = document.createElement('span');
    category.className = 'category-pill';
    category.style.setProperty('--category-color', categoryColor(row.category));
    category.textContent = categoryName(row.category);

    const amount = document.createElement('span');
    amount.className = 'detail-amount';
    amount.textContent = formatRub(isRefundDetails ? -Math.abs(Number(row.amount) || 0) : (Number(row.amount) || 0));

    item.append(date, source, title, category, amount);
    els.detailRows.appendChild(item);
  }
}

function updateAnalytics() {
  syncDateInputs();
  const sources = selectedAnalyticsSources();
  const group = els.periodGroup.value;
  const { records, periods, total, range } = buildAnalyticsData(sources, group);
  const refunds = selectedRefundTotal(sources, range);
  const averageLabel = periodUnitLabels[group] || periodUnitLabels.month;

  renderActiveFilters(sources);
  els.analyticsEmpty.textContent = hasCollected
    ? (sources.size ? 'За выбранный период покупок нет.' : 'В фильтре отчёта выключены все источники.')
    : 'Выберите маркетплейсы сверху и нажмите «Собрать данные». В этом профиле браузера нужно быть залогиненным в выбранные магазины.';

  els.analyticsTotal.textContent = formatRub(total);
  const prevRange = previousRange(range);
  const prevTotal = prevRange ? totalForRange(sources, prevRange) : 0;
  const comparison = prevRange ? compareText(total, prevTotal) : '';
  els.analyticsTotalCompare.textContent = comparison;
  els.analyticsTotalCompare.className = comparison.startsWith('+')
    ? 'up'
    : (comparison.startsWith('-') ? 'down' : '');
  els.analyticsAverage.textContent = formatRub(periods.length ? total / periods.length : 0);
  els.analyticsAverageLabel.textContent = averageLabel;
  els.analyticsPurchases.textContent = String(records.length);
  els.analyticsPurchasesLabel.textContent = pluralRu(records.length, ['покупка', 'покупки', 'покупок']);
  els.analyticsRefunds.textContent = formatRub(refunds);
  els.chartRange.textContent = periods.length ? `${periods[0].key} - ${periods[periods.length - 1].key}` : '';

  renderPeriodChart(periods);
  renderSourceBreakdown(records);
  renderCategoryBreakdown(records);
  renderTopItems(records);
  renderDetails(records, group);
}

function updateResult(records, stats = {}) {
  const serviceRowsDropped = records.filter(isServiceRow).length;
  const cleaned = absorbReturns(records.filter((row) => !isServiceRow(row)));
  const cleaningStats = {
    ...cleaned.stats,
    serviceRowsDropped
  };
  absorbedRefunds = (cleaningStats.refundsAbsorbed || []).map(withCategory);
  rows = cleaned.rows.map(withCategory).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  document.body.classList.toggle('has-data', rows.length > 0);
  csvText = makeCsv(rows);
  updateCsvButton();
  updateDateInputBounds();
  logParserStats({ ...stats, cleaning: cleaningStats });
  updateAnalytics();
  renderRunSummary();
  return cleaningStats;
}

function downloadCsv() {
  if (!csvText) return;
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `markettrat-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyLog() {
  await navigator.clipboard.writeText(logLines.join('\n'));
  const oldText = els.copyLog.textContent;
  els.copyLog.textContent = 'Скопировано';
  setTimeout(() => {
    els.copyLog.textContent = oldText;
  }, 1200);
}

async function uploadCsv() {
  const file = els.uploadCsvInput.files?.[0];
  if (!file) return;

  els.uploadCsv.disabled = true;
  showWarnings();

  try {
    const importedRows = globalThis.parseSpendCsv(await file.text());
    if (!importedRows.length) throw new Error('в CSV нет строк');

    hasCollected = true;
    selectedPeriodKey = '';
    detailFilter = null;
    resetDetailPaging();
    lastRunAt = null;
    lastRunKind = '';
    lastWarningCount = 0;
    runDetailsOpen = true;
    collectStatuses = {};
    renderSourceStatuses();
    const cleaningStats = updateResult(importedRows, {});
    renderQualitySummary(importedRows, {}, cleaningStats, []);
    finishRun('Загружено');
    setStatus(`Загружено: ${rows.length} строк из ${file.name}.`, 1, 1);
    appendLog(`Загружен CSV: ${file.name}, строк ${rows.length}.`);
  } catch (error) {
    setStatus(`Ошибка загрузки CSV: ${error.message}`);
    showWarnings([error.message]);
    appendLog(`Ошибка загрузки CSV: ${error.message}`);
  } finally {
    els.uploadCsv.disabled = false;
    els.uploadCsvInput.value = '';
  }
}

async function collect() {
  const sources = selectedCollectSources();

  if (sources.length === 0) {
    setStatus('Выберите хотя бы один источник.');
    appendLog('Источник не выбран.');
    return;
  }

  if (!api?.runtime?.sendMessage) {
    setStatus('Откройте страницу из иконки установленного расширения.');
    appendLog('Сбор доступен только внутри установленного расширения.');
    return;
  }

  els.collect.disabled = true;
  els.uploadCsv.disabled = true;
  els.downloadCsv.disabled = true;
  showWarnings();
  hasCollected = false;
  selectedPeriodKey = '';
  detailFilter = null;
  resetDetailPaging();
  lastRunAt = null;
  lastRunKind = '';
  lastWarningCount = 0;
  runDetailsOpen = true;
  updateResult([], {});
  renderQualitySummary();
  setCollectStatuses(sources, 'waiting', 'ожидает');
  logLineByKey.clear();
  setStatus('Начинаю сбор...', 0, sources.length);
  appendLog(`Старт: ${sources.join(', ')}.`);

  try {
    const started = await callChrome(api.runtime.sendMessage, {
      type: 'SPEND_COLLECT_START',
      sources,
      options: defaultCollectOptions
    });
    if (!started?.ok || !started.jobId) throw new Error(started?.error || 'Не удалось запустить сбор.');

    const response = await waitForCollectJob(started.jobId);
    if (!response?.ok) throw new Error(response?.error || 'Не удалось собрать данные.');

    hasCollected = true;
    const warnings = response.warnings || [];
    const cleaningStats = updateResult(response.rows || [], response.stats || {});
    renderQualitySummary(response.rows || [], response.stats || {}, cleaningStats, warnings);
    showWarnings(warnings);
    for (const warning of warnings) appendLog(`Предупреждение: ${warning}`);
    for (const source of sources) {
      if (collectStatuses[source]?.state !== 'error') setCollectStatus(source, 'done', 'готово');
    }
    finishRun('Собрано', warnings.length);
    const downloadStatus = rows.length ? 'CSV готов к скачиванию' : 'строк для CSV нет';
    setStatus(`Готово: ${rows.length} строк, ${downloadStatus}.`, 1, 1);
    appendLog(`Готово: ${rows.length} строк, ${downloadStatus}.`);
  } catch (error) {
    setStatus(`Ошибка: ${error.message}`);
    showWarnings([error.message]);
    for (const source of Object.keys(collectStatuses)) {
      if (collectStatuses[source].state !== 'done') setCollectStatus(source, 'error', 'ошибка', error.message);
    }
    appendLog(`Ошибка: ${error.message}`);
  } finally {
    els.collect.disabled = false;
    els.uploadCsv.disabled = false;
  }
}

api?.runtime?.onMessage?.addListener?.((message) => {
  if (message?.type === 'SPEND_PROGRESS') {
    const text = message.message || 'Сбор...';
    setStatus(text, message.value ?? null, message.max ?? null);
    const source = sourceFromProgress(text);
    if (source) {
      const status = collectStatusFromProgress(text);
      setCollectStatus(source, status.state, status.label, text);
    }
    appendLog(text, progressLogKey(text));
  }
});

els.collect.addEventListener('click', collect);
els.uploadCsv.addEventListener('click', () => els.uploadCsvInput.click());
els.uploadCsvInput.addEventListener('change', () => {
  uploadCsv().catch((error) => appendLog(`Ошибка загрузки CSV: ${error.message}`));
});
els.downloadCsv.addEventListener('click', downloadCsv);
els.runDownloadCsv.addEventListener('click', downloadCsv);
els.analyticsRefunds.parentElement.title = 'Показать учтённые возвраты';
makeClickable(els.analyticsRefunds.parentElement, () => setDetailFilter({ type: 'refunds' }, true));
els.toggleRunDetails.addEventListener('click', () => {
  runDetailsOpen = !runDetailsOpen;
  renderRunSummary();
});
makeClickable(els.warningBanner, () => {
  if (els.warningBanner.hidden) return;
  setActiveView('log');
  requestAnimationFrame(() => {
    els.log.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.log.focus();
  });
});
els.copyLog.addEventListener('click', () => {
  copyLog().catch((error) => appendLog(`Ошибка копирования лога: ${error.message}`));
});
els.themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
for (const button of els.tabButtons) {
  button.addEventListener('click', () => setActiveView(button.dataset.view));
}
for (const button of els.quickPeriodButtons) {
  button.addEventListener('click', () => applyQuickPeriod(button.dataset.period));
}
els.quickPeriodSelect.addEventListener('change', () => {
  const period = els.quickPeriodSelect.value;
  if (period === 'custom') {
    els.dateFrom.focus();
    return;
  }
  applyQuickPeriod(period);
});
els.periodGroup.addEventListener('change', () => {
  selectedPeriodKey = '';
  detailFilter = null;
  resetDetailPaging();
  updateAnalytics();
});
els.dateFrom.addEventListener('change', () => {
  selectedPeriodKey = '';
  detailFilter = null;
  els.quickPeriodSelect.value = 'custom';
  resetDetailPaging();
  updateAnalytics();
});
els.dateTo.addEventListener('change', () => {
  selectedPeriodKey = '';
  detailFilter = null;
  els.quickPeriodSelect.value = 'custom';
  resetDetailPaging();
  updateAnalytics();
});
els.resetPeriod.addEventListener('click', () => applyQuickPeriod('all'));
for (const input of [els.analyticsOzon, els.analyticsWb, els.analyticsYandex]) {
  input.addEventListener('change', () => {
    detailFilter = null;
    resetDetailPaging();
    updateAnalytics();
  });
}
for (const [, input] of collectSourceInputs) {
  input.addEventListener('change', updateProgressFill);
}
els.categoryChartType.addEventListener('change', () => {
  localStorage.setItem(categoryChartTypeStorageKey, els.categoryChartType.value);
  updateAnalytics();
});
els.clearDetailFilter.addEventListener('click', () => {
  detailFilter = null;
  els.detailSearch.value = '';
  resetDetailPaging();
  updateAnalytics();
});
els.detailSearch.addEventListener('input', () => {
  resetDetailPaging();
  updateAnalytics();
});
els.detailPageSize.addEventListener('change', () => {
  resetDetailPaging();
  updateAnalytics();
});
els.detailMore.addEventListener('click', () => {
  detailShownCount += detailPageSize();
  updateAnalytics();
});
els.clearLog.addEventListener('click', () => {
  logLines = [];
  logLineByKey.clear();
  renderLog();
});

els.categoryChartType.value = loadCategoryChartType();
applyTheme(loadTheme());
updateProgressFill();
renderLog();
updateAnalytics();
checkForUpdate();
loadCategoryRulePack();
