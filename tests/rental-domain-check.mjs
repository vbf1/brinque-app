import assert from 'node:assert/strict';
import { filterRentalCustomers, validateRentalDraft } from '../apps/desktop_react/src/data/rentalDomain.ts';

const valid = {
  customerId: 'customer-1',
  startDate: '2026-11-10',
  endDate: '2026-11-10',
  startTime: '09:00',
  endTime: '17:00',
  status: 'pending',
  deliveryMethod: 'customer_pickup',
  totalAmount: 150,
  items: [{ product_id: 'toy-1', quantity: 2, unit_price: 75 }],
};

assert.doesNotThrow(() => validateRentalDraft(valid));
assert.throws(() => validateRentalDraft({ ...valid, customerId: ' ' }), /cliente/i);
assert.throws(() => validateRentalDraft({ ...valid, startDate: '2026-02-30' }), /período/i);
assert.throws(() => validateRentalDraft({ ...valid, endDate: '2026-11-09' }), /período/i);
assert.throws(() => validateRentalDraft({ ...valid, startTime: '17:00:00', endTime: '17:00' }), /término/i);
assert.throws(() => validateRentalDraft({ ...valid, deliveryMethod: 'delivery', deliveryAddress: ' ' }), /endereço/i);
assert.throws(() => validateRentalDraft({ ...valid, totalAmount: Number.NaN }), /valor total/i);
assert.throws(() => validateRentalDraft({ ...valid, items: [] }), /pelo menos um brinquedo/i);
assert.throws(() => validateRentalDraft({
  ...valid,
  items: [
    { product_id: 'toy-1', quantity: 1, unit_price: 10 },
    { product_id: 'toy-1', quantity: 2, unit_price: 10 },
  ],
}), /apenas uma vez/i);
assert.throws(() => validateRentalDraft({
  ...valid,
  items: [{ product_id: 'toy-1', quantity: 0, unit_price: 10 }],
}), /quantidade/i);
assert.throws(() => validateRentalDraft({
  ...valid,
  items: [{ product_id: 'toy-1', quantity: 1, unit_price: -1 }],
}), /preço unitário/i);

process.stdout.write('Rental domain checks: 11 passed.\\n');

const customers = [
  { id: 'customer-1', name: 'Ana Souza' },
  { id: 'customer-2', name: 'Bruno Lima' },
  { id: 'customer-3', name: 'Carla Santos' },
];
assert.equal(filterRentalCustomers(customers, '').length, 3);
assert.deepEqual(filterRentalCustomers(customers, ' bruno '), [customers[1]]);
assert.deepEqual(filterRentalCustomers(customers, 'SANTOS'), [customers[2]]);
assert.equal(filterRentalCustomers(customers, 'cliente inexistente').length, 0);
