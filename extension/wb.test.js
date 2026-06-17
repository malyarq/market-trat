const assert = require('node:assert/strict');
const { parseWbReceiptItems } = require('./background.js');

function wbItem(title, amount) {
  return `
    <div class="products-item">
      <div class="products-cell products-cell_name">
        <div class="products-prop-value">Наименование ${title}</div>
      </div>
      <div class="products-cell products-cell_price"></div>
      <div class="products-cell_cost">
        <div class="products-prop-value">${amount}</div>
      </div>
    </div>
  `;
}

const items = parseWbReceiptItems(`
  ${wbItem('Футболка оверсайз', '1299,00 ₽')}
  ${wbItem('Услуга доставки', '100,00 ₽')}
  ${wbItem('Комиссия сервиса', '15,00 ₽')}
  <div class="total"></div>
`);

assert.deepEqual(items, [{ title: 'Футболка оверсайз', amount: 1299, itemIndex: 1 }]);
