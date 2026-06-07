import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';

/**
 * v4.5.20 — Hardened migration runner so it actually completes against
 * TiDB Cloud Serverless during `vercel-build`.
 *
 * Key behaviours:
 *
 *  - Strip block comments before splitting on `;\n` so multi-line
 *    statements (CASE expressions, etc.) survive.
 *  - Skip CREATE/DROP TRIGGER statements outright — TiDB Serverless
 *    rejects them with errno 8200, and we don't want a single
 *    unsupported statement to abort the whole migration step.
 *  - Tolerate idempotent errors (column / key / table already exists)
 *    AND TiDB-specific "unsupported feature" errors (8200).
 *  - Log every skip with a reason so the build log is readable.
 *
 * Migration 009_tidb_schema_align.sql is the TiDB-friendly counterpart
 * to 004 + 006. It uses split-ADD-then-INDEX patterns instead of
 * inline UNIQUE constraints and avoids expression defaults on TEXT
 * columns. On regular MySQL it no-ops via the idempotent error set.
 */

// MySQL error codes that are safe to ignore when re-running migrations.
const IDEMPOTENT_ERRORS = new Set([
  1050, // table already exists
  1060, // duplicate column name
  1061, // duplicate key name
  1062, // duplicate entry for unique key (data already seeded)
  1091, // can't DROP; doesn't exist
  1146, // table doesn't exist (DROPping something already gone)
]);

// TiDB-specific errors we tolerate (log but continue):
const TIDB_TOLERATED_ERRORS = new Set([
  1235, // 'this version of MySQL doesn't yet support…'
  8200, // TiDB unsupported feature
]);

function stripBlockComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '');
}

function splitStatements(sql: string) {
  return stripBlockComments(sql)
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

async function runFile(file: string) {
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  let applied = 0;
  let skipped = 0;
  let tolerated = 0;

  for (const statement of statements) {
    const head = statement.slice(0, 60).replace(/\s+/g, ' ');

    // TiDB Serverless rejects triggers; the application dual-writes
    // status / status_int directly on the legacy save handlers.
    if (/^\s*(CREATE|DROP)\s+TRIGGER/i.test(statement)) {
      skipped++;
      console.log(`  skip (trigger, TiDB unsupported): ${head}…`);
      continue;
    }

    try {
      await pool.query(statement);
      applied++;
    } catch (err: any) {
      if (IDEMPOTENT_ERRORS.has(err?.errno)) {
        skipped++;
        console.log(`  skip (already applied): ${head}…`);
        continue;
      }
      if (TIDB_TOLERATED_ERRORS.has(err?.errno)) {
        tolerated++;
        console.log(`  skip (TiDB errno ${err.errno}): ${head}…`);
        continue;
      }
      throw err;
    }
  }
  console.log(`  ${applied} applied · ${skipped} skipped · ${tolerated} TiDB-tolerated`);
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
