import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isAcceptedQuoteStatus,
  minimumQuotePayment,
  resolveQuotePaymentBase,
} from '../src/services/quotePayment';

const root = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(__dirname, '../..'),
].find((candidate) => fs.existsSync(path.join(candidate, 'backend/src/routes/payments.ts')));
assert.ok(root, 'Repository root could not be resolved');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

assert.equal(resolveQuotePaymentBase({ quoteAmount: 1_500, paymentOption: 'full' }), 1_500);
assert.equal(resolveQuotePaymentBase({ quoteAmount: 1_500, paymentOption: 'minimum' }), 375);
assert.equal(minimumQuotePayment(1_500, '500.00'), 500);
assert.equal(resolveQuotePaymentBase({
  quoteAmount: 1_500,
  advanceAmount: 500,
  paymentOption: 'custom',
  requestedBaseAmount: 900,
}), 900);
assert.throws(() => resolveQuotePaymentBase({
  quoteAmount: 1_500,
  paymentOption: 'custom',
  requestedBaseAmount: 100,
}), /between 375 and 1500/);
assert.equal(isAcceptedQuoteStatus('accepted', 1), true);
assert.equal(isAcceptedQuoteStatus('sent', 2), true);

const frontendQuotePayment = read('src/lib/quote-payment.ts');
assert.match(frontendQuotePayment, /quote\?\.amount/);
assert.doesNotMatch(frontendQuotePayment, /quote\?\.total/,
  'fee-inclusive quote.total must not become the payment base');

const paymentsRoute = read('backend/src/routes/payments.ts');
assert.match(paymentsRoute, /quotation_id:\s+body\.quotation_id/);
assert.match(paymentsRoute, /base_amount:\s+body\.base_amount/);
assert.match(paymentsRoute, /payment_option:\s+body\.payment_option/);

const idempotency = read('backend/src/middleware/idempotency.ts');
assert.match(idempotency, /rawKey\}\|\$\{userId\}\|\$\{userType\}\|\$\{endpoint\}/);

const paymentWorkflow = read('backend/src/services/paymentWorkflow.ts');
assert.match(paymentWorkflow, /amount = \?, order_amount = \?/);
assert.match(paymentWorkflow, /VALUES \(\?, 1, '1', 'CUSTOMER'/);
assert.match(paymentWorkflow, /direction = 'hold' LIMIT 1/);

const vendorRoute = read('backend/src/routes/vendor.ts');
assert.match(vendorRoute, /workflow_bucket/);
assert.match(vendorRoute, /VALUES \(\?, 2, '1', 'VENDOR'/);
assert.match(vendorRoute, /'sent', 11, NOW\(\)/);

const customerList = read('src/app/account/enquiries/page.tsx');
assert.match(customerList, /map\(normalizeCustomerEnquiry\)/);
const customerProjects = read('src/app/account/projects/page.tsx');
assert.match(customerProjects, /customerApi\.listProjects\(\)/);

console.log('July 21 enquiry and payment workflow checks passed.');
