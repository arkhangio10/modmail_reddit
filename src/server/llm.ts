import { SYSTEM_PROMPT, type LLMResult } from "./prompts.ts";
// Note on system-prompt JSON marker: OpenAI's response_format: { type: "json_object" }
// requires the literal word "JSON" to appear in one of the messages. SYSTEM_PROMPT already
// says "Respond with a single JSON object" so this constraint is satisfied.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Pinned per CLAUDE.md Hard Rule #5 — use a dated snapshot, not the floating alias.
const MODEL = "gpt-4o-mini-2024-07-18";
const MAX_TOKENS = 800;

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; type?: string };
};

export async function analyzeModmail(
  apiKey: string,
  userPrompt: string,
): Promise<LLMResult | null> {
  let responseText: string;
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Force JSON output — system prompt already mentions "JSON" so this is valid.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    responseText = await res.text();
  } catch (err) {
    console.error("[llm] fetch threw:", err);
    return null;
  }

  let data: OpenAIResponse;
  try {
    data = JSON.parse(responseText) as OpenAIResponse;
  } catch (err) {
    console.error("[llm] response not JSON:", responseText.slice(0, 300));
    return null;
  }

  if (data.error) {
    console.error("[llm] OpenAI error:", JSON.stringify(data.error).slice(0, 500));
    return null;
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  // Defensive JSON extract — response_format guarantees JSON but we still match
  // the first {...} block in case the model wrapped it.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[llm] no JSON object in model output:", text.slice(0, 300));
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]) as LLMResult;
    if (
      typeof parsed.classification !== "string" ||
      typeof parsed.severity !== "string" ||
      typeof parsed.confidence !== "string" ||
      typeof parsed.isAbusive !== "boolean" ||
      typeof parsed.draftReply !== "string"
    ) {
      console.error("[llm] missing required fields:", parsed);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[llm] JSON.parse failed:", err, match[0].slice(0, 300));
    return null;
  }
}
