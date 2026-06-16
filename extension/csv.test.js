const assert = require('node:assert/strict');
const { parseSpendCsv } = require('./csv.js');

assert.deepEqual(parseSpendCsv([
  '\uFEFFdate,marketplace,title,amount,currency,category',
  '2026-01-02,ozon,"Tea, green",123.4,RUB,Продукты',
  '2026-01-03,Wildberries,"Quote ""item""","-10,5",RUB,',
  '2026-01-04,yandex,Delivery,99,RUB,Доставка'
].join('\r\n')), [
  {
    date: '2026-01-02',
    source: 'ozon',
    title: 'Tea, green',
    amount: '123.40',
    currency: 'RUB',
    category: 'Продукты'
  },
  {
    date: '2026-01-03',
    source: 'wildberries',
    title: 'Quote "item"',
    amount: '-10.50',
    currency: 'RUB',
    category: ''
  },
  {
    date: '2026-01-04',
    source: 'yandex',
    title: 'Delivery',
    amount: '99.00',
    currency: 'RUB',
    category: 'Доставка'
  }
]);

assert.throws(
  () => parseSpendCsv('title,amount\nx,1'),
  /date, marketplace/
);

assert.throws(
  () => parseSpendCsv('date,marketplace,title,amount\n2026-01-01,other,x,1'),
  /неизвестный marketplace/
);
