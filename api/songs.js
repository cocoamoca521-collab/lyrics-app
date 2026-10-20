import { randomUUID } from 'node:crypto';
import { getDb, toObjects, checkAppToken } from './_db.js';

const WRITABLE_COLUMNS = ['character_name', 'title', 'lyrics', 'tag', 'sort_order', 'updated_at'];

function pickWritable(body) {
  const fields = {};
  for (const col of WRITABLE_COLUMNS) {
    if (body && Object.hasOwn(body, col)) fields[col] = body[col];
  }
  return fields;
}

async function selectById(db, id) {
  return toObjects(await db.execute({ sql: 'SELECT * FROM lyrics WHERE id = ?', args: [id] }));
}

async function listSongs(db, res) {
  const result = await db.execute('SELECT * FROM lyrics ORDER BY updated_at DESC');
  return res.status(200).json(toObjects(result));
}

async function createSong(db, req, res) {
  const fields = pickWritable(req.body);
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    ...fields,
  };
  const cols = Object.keys(row);
  await db.execute({
    sql: `INSERT INTO lyrics (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    args: cols.map((c) => row[c] ?? null),
  });
  return res.status(201).json(await selectById(db, row.id));
}

async function updateSong(db, req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id is required' });
  const fields = pickWritable(req.body);
  const cols = Object.keys(fields);
  if (cols.length === 0) return res.status(400).json({ error: 'no updatable fields' });

  const result = await db.execute({
    sql: `UPDATE lyrics SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    args: [...cols.map((c) => fields[c] ?? null), id],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: 'not found' });
  return res.status(200).json(await selectById(db, id));
}

async function deleteSong(db, req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id is required' });
  await db.execute({ sql: 'DELETE FROM lyrics WHERE id = ?', args: [id] });
  return res.status(204).end();
}

// じぶん順の一括リナンバー。全行を1トランザクションで書き換え、途中失敗なら何も変わらない。
async function reorderSongs(db, req, res) {
  const updates = req.body;
  const valid = Array.isArray(updates) && updates.length > 0 && updates.every(
    (u) => u && typeof u.id === 'string' && Number.isInteger(u.sort_order)
  );
  if (!valid) return res.status(400).json({ error: 'body must be [{ id, sort_order }]' });

  await db.batch(
    updates.map((u) => ({
      sql: 'UPDATE lyrics SET sort_order = ? WHERE id = ?',
      args: [u.sort_order, u.id],
    })),
    'write'
  );
  return res.status(204).end();
}

export default async function handler(req, res) {
  if (!checkAppToken(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = getDb();
  try {
    switch (req.method) {
      case 'GET': return await listSongs(db, res);
      case 'POST': return await createSong(db, req, res);
      case 'PATCH': return await updateSong(db, req, res);
      case 'DELETE': return await deleteSong(db, req, res);
      case 'PUT': return await reorderSongs(db, req, res);
      default:
        res.setHeader('Allow', 'GET, POST, PATCH, DELETE, PUT');
        return res.status(405).json({ error: 'method not allowed' });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
