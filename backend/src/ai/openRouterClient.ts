import axios from "axios";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = ["meta-llama/llama-3.1-8b-instruct:free", "qwen/qwen-2.5-7b-instruct:free"];

const resolveModels = (): string[] => {
  const primary = process.env.OPENROUTER_MODEL?.trim();
  const fallbackRaw = process.env.OPENROUTER_FALLBACK_MODELS?.trim() ?? "";
  const fallback = fallbackRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const merged = [primary, ...fallback, ...DEFAULT_MODELS].filter((m): m is string => Boolean(m));
  return [...new Set(merged)];
};

export const generateWithOpenRouter = async (prompt: string): Promise<string | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  for (const model of resolveModels()) {
    try {
      const response = await axios.post(
        OPENROUTER_URL,
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 80,
          temperature: 0.7
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:5173",
            "X-Title": "TerminalRPGEditor"
          },
          timeout: 12000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content.trim();
    } catch {
      continue;
    }
  }

  return null;
};

