import { SYSTEM_PROMPT, type LLMResult } from "./prompts.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Pinned per CLAUDE.md Hard Rule #5 — do not use the floating alias.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 800;

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export async function analyzeModmail(
  apiKey: string,
  userPrompt: string,
): Promise<LLMResult | null> {
  let responseText: string;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    responseText = await res.text();
  } catch (err) {
    console.error("[llm] fetch threw:", err);
    return null;
  }

  let data: AnthropicResponse;
  try {
    data = JSON.parse(responseText) as AnthropicResponse;
  } catch (err) {
    console.error("[llm] response not JSON:", responseText.slice(0, 300));
    return null;
  }

  if ("error" in data) {
    console.error("[llm] Anthropic error:", JSON.stringify(data).slice(0, 500));
    return null;
  }

  const text = (data as AnthropicResponse).content?.find((c) => c.type === "text")?.text ?? "";
  // Defensive JSON extract: find the first {...} block in case the model wrapped it.
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
