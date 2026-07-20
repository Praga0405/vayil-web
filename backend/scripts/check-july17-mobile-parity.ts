import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(__dirname, '../../..'),
].find((candidate) => fs.existsSync(path.join(candidate, 'src/app/vendor-studio/setup/page.tsx')));
assert.ok(root, 'Repository root could not be resolved');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const setup = read('src/app/vendor-studio/setup/page.tsx');
assert.match(setup, /\['approved', 'verified', 'kyc_approved', 'active'\]/);
assert.match(setup, /profile\?\.proof_type \|\| profile\?\.kyc_id_type/);
assert.match(setup, /View approved document/);

const vendorProfile = read('src/app/vendors/[id]/page.tsx');
assert.match(vendorProfile, /serviceId:\s+Number\(selectedService\.id\)/);
assert.match(vendorProfile, /if \(!selectedService\).*Select a service/);

const customerRoute = read('backend/src/routes/customer.ts');
assert.match(customerRoute, /Service does not belong to the selected vendor/);
assert.match(customerRoute, /enquirySvc\.createEnquiry/);
assert.match(customerRoute, /first_name:\s+customer\?\.name/);

const legacyCustomer = read('backend/src/routes/legacyCustomer.ts');
assert.match(legacyCustomer, /NULLIF\(e\.category, ''\), 'Home Service'/);
assert.match(legacyCustomer, /WHERE customer_id = \?\s+AND enquiry_id = \?/);
assert.doesNotMatch(legacyCustomer, /Missing required fields: quote_id/);
assert.match(legacyCustomer, /existingPaymentRows/);

console.log('July 17 mobile compatibility contract checks passed.');
