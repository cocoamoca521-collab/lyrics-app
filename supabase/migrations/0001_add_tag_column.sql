-- 世界切り替え機能用: キャラ判定タグ列の追加
-- character_name（表示用の自由記述）とは独立させ、判定ロジックはこの列だけを見る。
alter table lyrics add column if not exists tag text;

-- 既存曲は全て藤宮湊のキャラソンなので一括セット。
-- tag が未設定（今後 import.js 等で新規登録されて tag が入らなかった場合）の曲も
-- 対象になるよう is null で絞っている。
update lyrics set tag = '藤宮湊' where tag is null;
