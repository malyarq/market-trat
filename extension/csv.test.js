const assert = require('node:assert/strict');
const { mergeSpendRows, parseSpendCsv } = require('./csv.js');

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
    category: 'Продукты',
    type: 'purchase'
  },
  {
    date: '2026-01-03',
    source: 'wildberries',
    title: 'Quote "item"',
    amount: '-10.50',
    currency: 'RUB',
    category: '',
    type: 'refund'
  },
  {
    date: '2026-01-04',
    source: 'yandex',
    title: 'Delivery',
    amount: '99.00',
    currency: 'RUB',
    category: 'Доставка',
    type: 'purchase'
  }
]);

assert.equal(
  parseSpendCsv('date,marketplace,title,amount,currency,category,type\n2026-01-05,ozon,Tea,10,RUB,Продукты,refund')[0].type,
  'refund'
);
assert.deepEqual(
  parseSpendCsv('date,marketplace,title,amount,currency,category,type\n,ozon,Ozon PDF не разобран: Ozon cheque,0.00,RUB,unknown,purchase'),
  []
);

assert.throws(
  () => parseSpendCsv('title,amount\nx,1'),
  /date, marketplace/
);

assert.throws(
  () => parseSpendCsv('date,marketplace,title,amount\n2026-01-01,other,x,1'),
  /неизвестный marketplace/
);

const firstCsv = parseSpendCsv([
  'date,marketplace,title,amount,currency,category,type',
  '2026-01-01,ozon,Tea,10,RUB,Продукты,purchase',
  '2026-01-02,wb,Shoes,20,RUB,Обувь,purchase'
].join('\n'));
const secondCsv = parseSpendCsv([
  'date,marketplace,title,amount,currency,category,type',
  '2026-01-01,ozon, Tea ,10.00,RUB,Продукты,purchase',
  '2026-01-03,yandex,Book,30,RUB,Книги,purchase'
].join('\n'));
const merged = mergeSpendRows([...firstCsv, ...secondCsv]);
assert.equal(merged.duplicates, 0);
assert.deepEqual(merged.rows.map((row) => row.title), ['Tea', 'Shoes', 'Tea', 'Book']);

const sameReceipt = parseSpendCsv([
  'date,marketplace,title,amount,currency,category,type,marketplace_id,item_index',
  '2026-01-01,ozon,Tea,10,RUB,Продукты,purchase,receipt-1,1',
  '2026-01-01,ozon,Tea,10,RUB,Продукты,purchase,receipt-1,1',
  '2026-01-01,ozon,Tea,10,RUB,Продукты,purchase,receipt-1,2'
].join('\n'));
const receiptMerged = mergeSpendRows(sameReceipt);
assert.equal(receiptMerged.duplicates, 1);
assert.deepEqual(receiptMerged.rows.map((row) => row.item_index), ['1', '2']);

const oldAndNewReceiptRows = parseSpendCsv([
  'date,marketplace,title,amount,currency,category,type,marketplace_id,item_index',
  '2026-06-16,wildberries,Washer,559,RUB,Авто,purchase,receipt-1,',
  '2026-06-16,wildberries,Washer,559.00,RUB,Авто,purchase,receipt-1,1'
].join('\n'));
const oldAndNewMerged = mergeSpendRows(oldAndNewReceiptRows);
assert.equal(oldAndNewMerged.duplicates, 1);
assert.deepEqual(oldAndNewMerged.rows.map((row) => row.item_index), ['1']);

const ozonSiblingReceipts = parseSpendCsv([
  'date,marketplace,title,amount,currency,category,type,marketplace_id,item_index',
  '2026-06-15,ozon,Яндекс Плюс на 12 месяцев,2024,RUB,Подписки,purchase,55887469-0288-ae92b46c-7399-4fa3-aeeb-e472be915820-0-0,1',
  '2026-06-15,ozon,Яндекс Плюс на 12 месяцев,2024,RUB,Подписки,purchase,55887469-0288-82307747-54ad-4999-b8da-40646d7a0fbb-0-0,1'
].join('\n'));
assert.equal(mergeSpendRows(ozonSiblingReceipts).duplicates, 1);
