// 連続インポートモード用のAI整形中継。
// Anthropic APIキーはVercelの環境変数にのみ置く（クライアントには一切渡さない）。
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-5-5';

let _client;

function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function buildSystemPrompt(keepStructureTags, normalizeText) {
  const structureRule = keepStructureTags
    ? "[Verse] [Chorus] [Bridge] などのSunoの構造タグは残すこと。"
    : "[Verse] [Chorus] [Bridge] などのSunoの構造タグは全て取り除くこと。";

  const normalizeRule = normalizeText
    ? [
        "表記をととのえること：Suno向けにひらがなに開かれた漢字や、読み上げ用にひらがな化された数字などを、",
        "通常の自然な日本語表記（漢字・算用数字など）に復元すること。",
        "厳守事項：変換してよいのは表記のみ。歌詞の語句そのもの・改行位置・行の順序・構成は一切変更しないこと。",
        "AIが「良かれと思って」言葉を言い換えることは禁止。",
      ].join("")
    : "表記の変換は行わないこと。原文の表記のまま（構造タグの扱いのみ上記ルールに従う）にすること。";

  return [
    "あなたはSunoで生成した歌詞テキストから、曲タイトルと歌詞本文を抽出・整形するツールです。",
    "入力テキストの先頭付近にタイトルらしき行があればそれをタイトルとして抽出してください。",
    "見つからない場合は歌詞の内容から適切な短いタイトルを推測してください。",
    structureRule,
    normalizeRule,
    "空行の連続は最大1行にまとめて構いませんが、歌詞の意味段落（Verse/Chorusの区切りなど）を壊さないこと。",
    "抽出結果は必ず extract_song ツールの呼び出しとして返すこと。",
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const { rawText, keepStructureTags, normalizeText } = req.body ?? {};

    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(!!keepStructureTags, normalizeText !== false),
      messages: [
        { role: 'user', content: rawText },
      ],
      tools: [
        {
          name: 'extract_song',
          description: '抽出した曲タイトルと整形済み歌詞本文を返す',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '曲のタイトル' },
              lyrics: { type: 'string', description: '整形済みの歌詞本文' },
            },
            required: ['title', 'lyrics'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_song' },
    });

    if (message.stop_reason === 'refusal') {
      throw new Error(`request declined: ${message.stop_details?.category ?? 'unknown'}`);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('response truncated at max_tokens');
    }

    const toolUse = message.content.find((b) => b.type === 'tool_use');
    if (!toolUse) throw new Error('no tool_use block in response');

    const { title, lyrics } = toolUse.input;

    return res.status(200).json({ title, lyrics });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
