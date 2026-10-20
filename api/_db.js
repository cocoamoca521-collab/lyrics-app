import { createHash, timingSafeEqual } from 'node:crypto';
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

const digest = (value) => createHash('sha256').update(value).digest();

// APP_TOKEN 未設定なら全リクエストを拒否する（設定漏れで鍵なし公開にならないように）。
export function checkAppToken(req) {
  const expected = process.env.APP_TOKEN;
  const token = req.headers['x-app-token'];
  if (!expected || typeof token !== 'string' || !token) return false;
  return timingSafeEqual(digest(token), digest(expected));
}

export function toObjects(result) {
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
  );
}
