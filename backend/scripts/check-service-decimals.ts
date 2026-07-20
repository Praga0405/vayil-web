import assert from 'node:assert/strict';
import { optionalDecimal } from '../src/utils/decimal';

assert.equal(optionalDecimal('1500', 'price'), '1500.00');
assert.equal(optionalDecimal('1499.5', 'price'), '1499.50');
assert.equal(optionalDecimal(0, 'minimum_fee'), '0.00');
assert.equal(optionalDecimal('', 'price'), undefined);
assert.throws(() => optionalDecimal('1500.001', 'price'), /up to 2 decimal places/);
assert.throws(() => optionalDecimal('-1', 'price'), /non-negative number/);

console.log('Service decimal contract checks passed.');
