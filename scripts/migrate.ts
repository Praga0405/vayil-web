import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';

// MySQL error codes that are safe to ignore when re-running migrations.
// 1060 = Duplicate column name
// 1061 = Duplicate key name
// 1091 = Can't DROP; doesn't exist
const IDEMPOTENT_ERRORS = new Set([1060, 1061, 1091]);

async function runFile(file: string) {
  const sql = fs.readFileSync(file, 'utf8');
  const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (err: any) {
      if (IDEMPOTENT_ERRORS.has(err?.errno)) {
        console.log(`  skip (already applied): ${statement.slice(0, 60).replace(/\s+/g, ' ')}…`);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    console.log(`→ ${f}`);
    await runFile(path.join(dir, f));
  }
  console.log('Migration complete');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
