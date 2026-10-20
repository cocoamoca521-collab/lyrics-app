// Supabaseからエクスポートした lyrics の JSON を Turso に投入し、件数と中身を照合する。
// 使い方: node --env-file=.env.local scripts/import-supabase-export.mjs <export.json>
import fs from 'node:fs';
import { createClient } from '@libsql/client';

const COLUMNS = ['id', 'character_name', 'title', 'lyrics', 'created_at', 'updated_at', 'tag', 'sort_order'];

const exportPath = process.argv[2];
if (!exportPath) {
  console.error('usage: node --env-file=.env.local scripts/import-supabase-export.mjs <export.json>');
  process.exit(1);
}
if (!process.env.TURSO_DATABASE_URL) {
  console.error('TURSO_DATABASE_URL is not set');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const schema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
await db.executeMultiple(schema);

const existing = (await db.execute('SELECT COUNT(*) AS n FROM lyrics')).rows[0].n;
if (existing > 0) {
  console.error(`lyrics already has ${existing} rows; refusing to import twice`);
  process.exit(1);
}

await db.batch(
  source.map((row) => ({
    sql: `INSERT INTO lyrics (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
    args: COLUMNS.map((c) => row[c] ?? null),
  })),
  'write'
);

const result = await db.execute(`SELECT ${COLUMNS.join(', ')} FROM lyrics`);
const imported = new Map(result.rows.map((r) => [r.id, r]));

const countByTag = (rows) => rows.reduce((acc, r) => {
  const tag = r.tag ?? '(null)';
  acc[tag] = (acc[tag] || 0) + 1;
  return acc;
}, {});

const mismatches = [];
for (const row of source) {
  const got = imported.get(row.id);
  if (!got) { mismatches.push(`${row.id}: missing`); continue; }
  for (const c of COLUMNS) {
    if ((row[c] ?? null) !== (got[c] ?? null)) mismatches.push(`${row.id}.${c} differs`);
  }
}

console.log('source :', source.length, countByTag(source));
console.log('turso  :', result.rows.length, countByTag(result.rows));

if (source.length !== result.rows.length || mismatches.length > 0) {
  console.error('VERIFY FAILED');
  mismatches.slice(0, 20).forEach((m) => console.error('  ' + m));
  process.exit(1);
}
console.log('VERIFY OK: every row and column matches');
