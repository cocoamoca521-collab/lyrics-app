import { createClient } from '@libsql/client';

let _client;

export function getDb() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

export function toObjects(result) {
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
  );
}
