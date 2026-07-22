import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(__dirname, '../..'),
].find((candidate) => fs.existsSync(path.join(candidate, 'src/lib/api/client.ts')));
assert.ok(root, 'Repository root could not be resolved');

const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const apiClient = read('src/lib/api/client.ts');
assert.match(apiClient, /\^dev_\(customer\|vendor\)_token_/,
  'demo customer/vendor token markers must be recognized');
assert.match(apiClient, /\/auth\/otp\/send/,
  'demo marker promotion must use the existing OTP send endpoint');
assert.match(apiClient, /\/auth\/otp\/verify/,
  'demo marker promotion must use the existing OTP verification endpoint');
assert.match(apiClient, /demoTokenPromotion/,
  'concurrent protected requests must share a single token promotion');
assert.match(apiClient, /persistPromotedToken\(signedToken\)/,
  'the signed backend JWT must replace the demo marker');

const demoMode = read('src/lib/demoMode.ts');
assert.match(demoMode,
  /IS_PAYMENT_DEMO_MODE = process\.env\.NODE_ENV !== 'production' && IS_DEMO_MODE/,
  'production builds must never simulate successful payments');
assert.match(demoMode, /export async function paymentDemoOrLive/,
  'quote state changes need the payment-specific live-mode guard');

const paymentSurfaces = [
  'src/app/account/enquiries/[id]/page.tsx',
  'src/app/account/enquiries/[id]/pay/page.tsx',
  'src/app/account/projects/[id]/materials/page.tsx',
  'src/app/account/projects/[id]/materials/pay/page.tsx',
];

for (const file of paymentSurfaces) {
  const source = read(file);
  assert.match(source, /IS_PAYMENT_DEMO_MODE/,
    `${file} must use the payment-specific demo guard`);
  assert.doesNotMatch(source, /if \(IS_DEMO_MODE\)/,
    `${file} must not fake payment behavior in production`);
}

const enquiryDetail = read('src/app/account/enquiries/[id]/page.tsx');
assert.match(enquiryDetail, /paymentDemoOrLive\(\(\) => customerApi\.acceptQuote/,
  'production quote acceptance must reach the backend');
assert.match(enquiryDetail, /paymentDemoOrLive\(\(\) => customerApi\.rejectQuote/,
  'production quote rejection must reach the backend');

console.log('July 22 demo-login payment compatibility checks passed.');
