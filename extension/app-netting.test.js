const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeElement() {
  return {
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    parentElement: null,
    options: [],
    value: '',
    checked: true,
    hidden: false,
    disabled: false,
    textContent: '',
    addEventListener() {},
    append() {},
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    scrollIntoView() {},
    focus() {}
  };
}

const elements = new Map();
function element(id = '') {
  if (!elements.has(id)) {
    const item = fakeElement();
    item.parentElement = fakeElement();
    elements.set(id, item);
  }
  return elements.get(id);
}

const source = fs
  .readFileSync(path.join(__dirname, 'app.js'), 'utf8')
  .split("els.collect.addEventListener('click', collect);")[0];

const context = {
  console,
  chrome: null,
  globalThis: null,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  navigator: { hardwareConcurrency: 8 },
  document: {
    documentElement: fakeElement(),
    body: fakeElement(),
    getElementById: element,
    querySelector: () => element('query'),
    querySelectorAll: () => [],
    createElement: () => fakeElement(),
    createElementNS: () => fakeElement()
  },
  requestAnimationFrame(callback) { callback(); },
  fetch() { return Promise.reject(new Error('offline')); }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);

const records = [
  {
    date: '2024-03-10',
    source: 'yandex',
    title: 'Материнская плата Gigabyte B650 EAGLE AX',
    amount: '22070.00',
    currency: 'RUB',
    category: 'Электроника',
    type: 'purchase'
  },
  {
    date: '2024-03-15',
    source: 'yandex',
    title: 'Материнская плата Gigabyte B650 EAGLE AX',
    amount: '-22070.00',
    currency: 'RUB',
    category: 'Электроника',
    type: 'refund'
  },
  {
    date: '2024-03-20',
    source: 'yandex',
    title: 'Материнская плата Gigabyte B650 EAGLE AX',
    amount: '20649.00',
    currency: 'RUB',
    category: 'Электроника',
    type: 'purchase'
  }
];

assert.equal(context.buildTopItems(records)[0].amount, 20649);
assert.equal(context.buildCategoryBreakdown(records).entries[0].amount, 20649);

vm.runInContext("budgets = { 'Электроника': 21000 }", context);
assert.equal(context.budgetEntries(records)[0].spent, 20649);

context.netRecords = records;
vm.runInContext('rows = netRecords', context);
const analytics = context.buildAnalyticsData(new Set(['yandex']), 'month');
assert.equal(analytics.periods[0].byCategory['Электроника'], 20649);

const known = context.collectKnownReceipts([
  { date: '2024-01-01', source: 'ozon', marketplace_id: 'ozon-old', receipt_url: 'https://ozon-old' },
  { date: '2024-02-01', source: 'ozon', marketplace_id: 'ozon-new', receipt_url: 'https://ozon-new' },
  { date: '2024-03-01', source: 'wildberries', marketplace_id: 'wb-1' },
  { date: '2024-04-01', source: 'yandex', marketplace_id: '123:fn:fpd:n' }
]);

assert.equal(known.ozon.slice(0, 2).join(','), 'ozon-new,https://ozon-new');
assert.equal(known.wildberries.join(','), 'wb-1');
assert.equal(known.yandexOrders.join(','), '123');
assert.equal(context.hasKnownReceipts(known), true);
element('periodChartMode').value = 'category';
const segments = context.periodChartSegments(analytics.periods[0]);
assert.equal(segments[0].key, 'Электроника');
assert.equal(segments[0].amount, 20649);
assert.ok(context.periodChartSegmentTitle(analytics.periods[0], segments[0]).includes('Электроника: 100%'));

const orderRecords = [
  { date: '2024-01-01', source: 'ozon', title: 'Big small month', amount: '1.00', currency: 'RUB', category: 'A', type: 'purchase' },
  { date: '2024-01-02', source: 'ozon', title: 'Small big month', amount: '50.00', currency: 'RUB', category: 'B', type: 'purchase' },
  { date: '2024-02-01', source: 'ozon', title: 'Big overall', amount: '100.00', currency: 'RUB', category: 'A', type: 'purchase' },
  { date: '2024-02-02', source: 'ozon', title: 'Small overall', amount: '1.00', currency: 'RUB', category: 'B', type: 'purchase' }
];
context.orderRecords = orderRecords;
vm.runInContext('rows = orderRecords', context);
const orderedAnalytics = context.buildAnalyticsData(new Set(['ozon']), 'month');
const categoryOrder = new Map(context.buildCategoryBreakdown(orderRecords).entries.map((item, index) => [item.category, index]));
assert.equal(context.periodChartSegments(orderedAnalytics.periods[0], categoryOrder).map((item) => item.key).join(','), 'A,B');
