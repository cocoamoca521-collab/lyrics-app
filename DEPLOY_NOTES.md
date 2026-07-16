# 世界切り替え＋連続インポート機能 デプロイ手順

このアプリ（GitHub Pagesの静的サイト）にはサーバーの口がないので、AI整形（Haiku呼び出し）だけ
Supabase Edge Functionを新設して中継する。以下の手順でSupabase側の設定をお願いします。

## 1. DBマイグレーション（タグ列の追加）

Supabaseダッシュボード → SQL Editor で `supabase/migrations/0001_add_tag_column.sql` の中身を実行。

やってることは2つだけ：
- `lyrics` テーブルに `tag` 列を追加
- 既存131曲全部に `tag = '藤宮湊'` をセット

## 2. Anthropic APIキーの発行

console.anthropic.com でこのアプリ専用のAPIキーを新規発行。
（Haiku呼び出しのみに使うので、他のキーと共用しない方が安全）

## 3. Supabase CLIでEdge Functionをデプロイ

プロジェクトref（`https://dbpferzntxfaxkucusne.supabase.co` の `dbpferzntxfaxkucusne` 部分）を使う。

```bash
# 未インストールなら
npm install -g supabase

# ログイン（ブラウザが開く）
supabase login

# このリポジトリのルートで実行
supabase link --project-ref dbpferzntxfaxkucusne

# APIキーをSecretsに登録（クライアントには一切渡らない）
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx --project-ref dbpferzntxfaxkucusne

# Function本体をデプロイ
supabase functions deploy format-lyrics --project-ref dbpferzntxfaxkucusne
```

デプロイが終わればエンドポイントは自動的に
`https://dbpferzntxfaxkucusne.supabase.co/functions/v1/format-lyrics`
になる（`index.html` 側は既にこのURLを直接計算してるので、追加の設定変更は不要）。

## 4. CORSの確認

`supabase/functions/format-lyrics/index.ts` の `ALLOWED_ORIGINS` に
GitHub PagesのURLを入れてある：

```
https://cocoamoca521-collab.github.io
```

もし実際に公開してるURL（カスタムドメイン等）がこれと違う場合は、この配列に追記してから
再デプロイしてください（`http://localhost:5500` はローカル確認用に入れてあります）。

## 5. 動作確認

1. デプロイ後、アプリをノアモードに切り替え
2. 右下の📥ボタンから連続インポートを開始
3. 適当な歌詞を貼り付けて「整形する」→ タイトル・歌詞が抽出されて出てくればOK
4. わざとネットワークを切った状態で試すと、整形なしモード（手動入力＋再試行ボタン）に
   落ちることも確認できるはず
