import assert from 'node:assert/strict';
import { calculateReorderItems } from './reorder';

const items = calculateReorderItems([
  { id: 1, name: 'Bread', unit_label: 'loaves', buy_price: 1, sell_price: 2, current_qty: 2, low_stock_threshold: 5 },
  { id: 2, name: 'Milk', unit_label: 'bottles', buy_price: 1, sell_price: 2, current_qty: 8, low_stock_threshold: 5 },
  { id: 3, name: 'Eggs', unit_label: 'trays', buy_price: 1, sell_price: 2, current_qty: 0, low_stock_threshold: 3 },
]);
assert.deepEqual(items.map(item => item.name), ['Eggs', 'Bread']);
assert.equal(items[0].suggested_qty, 6);
assert.equal(items[1].suggested_qty, 8);

console.log('reorder tests passed');
