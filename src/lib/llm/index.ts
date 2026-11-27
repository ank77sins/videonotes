import type { LlmConfig, LlmProvider } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.0-flash-exp:free",
  ollama: "llama3.2:3b",
  none: "",
};

export function isConfigured(cfg: LlmConfig | undefined): boolean {
  if (!cfg || cfg.provider === "none") return false;
  if (cfg.provider === "ollama") return true;
  return Boolean(cfg.apiKey);
}

export function resolveModel(cfg: LlmConfig): string {
  return cfg.model?.trim() || DEFAULT_MODELS[cfg.provider];
}

function assertConfigured(cfg: LlmConfig) {
  if (!isConfigured(cfg)) {
    throw new Error("No LLM provider configured.");
  }
  if (cfg.provider !== "ollama" && !cfg.apiKey) {
    throw new Error(`Missing API key for ${cfg.provider}.`);
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function complete(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  assertConfigured(cfg);
  const model = resolveModel(cfg);
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 4096;

  if (cfg.provider === "gemini") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
      {},
      {
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      },
    );
    return (
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
    ).trim();
  }

  if (cfg.provider === "groq" || cfg.provider === "openrouter") {
    const url =
      cfg.provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
    const data = await postJson(
      url,
      { Authorization: `Bearer ${cfg.apiKey}` },
      { model, messages, temperature, max_tokens: maxTokens },
    );
    return (data?.choices?.[0]?.message?.content ?? "").trim();
  }

  if (cfg.provider === "ollama") {
    const base = (cfg.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    let data: any;
    try {
      data = await postJson(
        `${base}/api/chat`,
        {},
        {
          model,
          messages,
          stream: false,
          options: { temperature, num_predict: maxTokens },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/not found/i.test(msg)) {
        const installed = await listOllamaModels(base).catch(() => [] as string[]);
        const hint = installed.length
          ? `Installed models: ${installed.join(", ")}. Set one of these as the model in Settings.`
          : "No models are installed yet. Run `ollama pull llama3.2:3b`.";
        throw new Error(
          `Ollama doesn't have the model "${model}". ${hint} (You can also leave the model blank to use the default.)`,
        );
      }
      throw err;
    }
    return (data?.message?.content ?? "").trim();
  }

  throw new Error(`Unsupported provider: ${cfg.provider}`);
}

async function listOllamaModels(base: string): Promise<string[]> {
  const res = await fetch(`${base}/api/tags`, { method: "GET" });
  if (!res.ok) return [];
  const data = (await res.json()) as { models?: { name?: string }[] };
  return (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
}

export async function testProvider(cfg: LlmConfig): Promise<string> {
  const reply = await complete(
    cfg,
    [
      { role: "system", content: "Reply with the single word: ready" },
      { role: "user", content: "ping" },
    ],
    { temperature: 0, maxTokens: 16 },
  );
  return reply.trim().slice(0, 120);
}

export async function vision(
  cfg: LlmConfig,
  imageBase64: string,
  mime: string,
  prompt: string,
): Promise<string> {
  assertConfigured(cfg);
  const model = resolveModel(cfg);

  if (cfg.provider === "gemini") {
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
      {},
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imageBase64 } }],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      },
    );
    return (
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
    ).trim();
  }

  if (cfg.provider === "openrouter") {
    const data = await postJson(
      "https://openrouter.ai/api/v1/chat/completions",
      { Authorization: `Bearer ${cfg.apiKey}` },
      {
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 512,
      },
    );
    return (data?.choices?.[0]?.message?.content ?? "").trim();
  }

  if (cfg.provider === "ollama") {
    const base = (cfg.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    const data = await postJson(
      `${base}/api/chat`,
      {},
      {
        model,
        stream: false,
        messages: [{ role: "user", content: prompt, images: [imageBase64] }],
        options: { temperature: 0.2 },
      },
    );
    return (data?.message?.content ?? "").trim();
  }

  throw new Error(`Vision not supported for provider: ${cfg.provider}`);
}
