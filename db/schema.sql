-- Supabase の lyrics テーブルを libSQL で再現したもの。
-- id は uuid 文字列、日時は Supabase から移した ISO 8601 文字列をそのまま保持する。
CREATE TABLE IF NOT EXISTS lyrics (
  id TEXT PRIMARY KEY,
  character_name TEXT,
  title TEXT,
  lyrics TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tag TEXT,
  sort_order INTEGER
);
