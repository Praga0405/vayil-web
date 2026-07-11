import assert from 'node:assert/strict';
import { calculateLegacyPaymentTotals, legacyGstPercentage } from '../src/services/legacyPaymentTotals';

const taxes = JSON.stringify({
  tax_options: [
    { tax_name: 'SGST', tax_percentage: '9' },
    { tax_name: 'CGST', tax_percentage: '9' },
  ],
});

assert.equal(legacyGstPercentage(taxes), 18);
assert.deepEqual(
  calculateLegacyPaymentTotals({
    planBaseAmount: '10000.00',
    quotationAmount: '9000.00',
    materialFinalAmount: '3717.00',
    platformFeePercentage: '5',
    taxOption: taxes,
  }),
  {
    planBaseAmount: 10000,
    platformCost: 500,
    taxCost: 1890,
    totalPlanAmount: 12390,
    totalMaterialAmount: 3717,
    totalAmount: 16107,
  },
);

assert.equal(
  calculateLegacyPaymentTotals({
    planBaseAmount: 0,
    quotationAmount: '1000',
    materialFinalAmount: 0,
    platformFeePercentage: 5,
    taxOption: taxes,
  }).totalPlanAmount,
  1239,
);

console.log('Legacy payment total checks passed');
