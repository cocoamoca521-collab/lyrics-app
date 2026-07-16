// 連続インポートモード用のAI整形中継。
// Anthropic APIキーはこのFunctionのSecretsにのみ置く（クライアントには一切渡さない）。

const ALLOWED_ORIGINS = new Set([
  "https://cocoamoca521-collab.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function buildSystemPrompt(keepStructureTags: boolean, normalizeText: boolean) {
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { rawText, keepStructureTags, normalizeText } = await req.json();

    if (!rawText || typeof rawText !== "string") {
      return new Response(JSON.stringify({ error: "rawText is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(!!keepStructureTags, normalizeText !== false),
        messages: [
          { role: "user", content: rawText },
        ],
        tools: [
          {
            name: "extract_song",
            description: "抽出した曲タイトルと整形済み歌詞本文を返す",
            input_schema: {
              type: "object",
              properties: {
                title: { type: "string", description: "曲のタイトル" },
                lyrics: { type: "string", description: "整形済みの歌詞本文" },
              },
              required: ["title", "lyrics"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "extract_song" },
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      throw new Error(`anthropic api error: ${anthropicRes.status} ${errBody}`);
    }

    const result = await anthropicRes.json();
    const toolUse = result.content?.find((b: any) => b.type === "tool_use");
    if (!toolUse) throw new Error("no tool_use block in response");

    const { title, lyrics } = toolUse.input;

    return new Response(JSON.stringify({ title, lyrics }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
