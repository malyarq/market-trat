const assert = require('node:assert/strict');
const { filterYandexRows, rowsFromYandexReceiptHtml } = require('./background.js');

function receiptHtml(settlement) {
  return `
    <div class="header">Кассовый чек. Приход</div>
    <table class="info-table">
      <tr><td>Смена N 72</td><td>02.06.26 11:50</td></tr>
    </table>
    <table class="receipt-table">
      <tr><td>N</td><td>Наим. пр.</td><td>Цена</td><td>Кол-во</td><td>НДС</td><td>Стоимость</td></tr>
      <tr>
        <td>1.</td>
        <td>Товар<br><div>Признак способа расчета: ${settlement}</div></td>
        <td>699.00</td><td>1.000</td><td>НДС 5%</td><td>699.00</td>
      </tr>
    </table>
  `;
}

const prepayment = rowsFromYandexReceiptHtml({
  orderId: '57730677568',
  id: '1',
  type: 'INCOME',
  fiscalUrl: 'https://check.yandex.ru/?fn=1&fpd=1&n=1'
}, receiptHtml('ПРЕДОПЛАТА 100%'));

const full = rowsFromYandexReceiptHtml({
  orderId: '57730677568',
  id: '2',
  type: 'OFFSET_ADVANCE_ON_DELIVERED',
  fiscalUrl: 'https://check.yandex.ru/?fn=2&fpd=2&n=2'
}, receiptHtml('ПОЛНЫЙ РАСЧЕТ'));

assert.equal(prepayment[0].title, 'Товар');
assert.equal(prepayment[0].date, '2026-06-02 11:50');

const filtered = filterYandexRows([...prepayment, ...full]);
assert.equal(filtered.prepaymentRowsDropped, 1);
assert.deepEqual(filtered.rows.map((row) => row.amount), ['699.00']);

const noServices = rowsFromYandexReceiptHtml({
  orderId: '57730677569',
  id: '3',
  type: 'INCOME',
  fiscalUrl: 'https://check.yandex.ru/?fn=3&fpd=3&n=3'
}, `
  <div class="header">Кассовый чек. Приход</div>
  <table class="info-table"><tr><td>Смена N 72</td><td>02.06.26 11:50</td></tr></table>
  <table class="receipt-table">
    <tr><td>N</td><td>Наим. пр.</td><td>Цена</td><td>Кол-во</td><td>НДС</td><td>Стоимость</td></tr>
    <tr><td>1.</td><td>Товар<br><div>Признак способа расчета: ПОЛНЫЙ РАСЧЕТ</div></td><td>699.00</td><td>1.000</td><td>НДС 5%</td><td>699.00</td></tr>
    <tr><td>2.</td><td>Доставка<br><div>Признак способа расчета: ПОЛНЫЙ РАСЧЕТ</div></td><td>99.00</td><td>1.000</td><td>НДС 5%</td><td>99.00</td></tr>
    <tr><td>3.</td><td>Сервисный сбор<br><div>Признак способа расчета: ПОЛНЫЙ РАСЧЕТ</div></td><td>49.00</td><td>1.000</td><td>НДС 5%</td><td>49.00</td></tr>
  </table>
`);

assert.deepEqual(noServices.map((row) => row.title), ['Товар']);
