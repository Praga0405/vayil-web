import fs from 'fs';
import path from 'path';

const required = [
  'src/index.ts','src/config.ts','src/db.ts','src/routes/auth.ts','src/routes/customer.ts','src/routes/vendor.ts','src/routes/ops.ts','src/services/tax.ts','migrations/001_complete_schema.sql','package.json'
];
for (const file of required) {
  if (!fs.existsSync(path.join(__dirname, '..', file))) throw new Error(`Missing ${file}`);
}
const index = fs.readFileSync(path.join(__dirname, '..', 'src/index.ts'), 'utf8');
for (const route of ['/auth', '/customers', '/vendors', '/ops']) {
  if (!index.includes(route)) throw new Error(`Route not mounted: ${route}`);
}
console.log('Smoke test passed');
