import { NextResponse } from "next/server";
import { openAiBase, isOpenAiCompatible } from "@/lib/llm";
import type { LlmProvider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_BASES: Partial<Record<LlmProvider, string>> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

async function listModels(provider: LlmProvider, rawBase: string, apiKey: string) {
  if (provider === "ollama") {
    const base = (rawBase || "http://localhost:11434").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Ollama responded ${res.status}. Is it running?` },
          { status: 502 },
        );
      }
      const data = (await res.json()) as { models?: { name?: string }[] };
      const models = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean).sort();
      return NextResponse.json({ ok: true, models });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reach Ollama.";
      return NextResponse.json(
        { ok: false, error: `Could not reach Ollama at ${base}. Is it running? (${message})` },
        { status: 502 },
      );
    }
  }

  if (!isOpenAiCompatible(provider)) {
    return NextResponse.json(
      { ok: false, error: "This provider does not list models. Type the model name instead." },
      { status: 400 },
    );
  }

  const base = openAiBase({
    provider,
    apiKey,
    model: "",
    baseUrl: rawBase || FALLBACK_BASES[provider] || "",
  }).replace(/\/$/, "");

  if (!base) {
    return NextResponse.json({ ok: false, error: "Add the API base URL first." }, { status: 400 });
  }
  if (!apiKey.trim() && provider !== "custom") {
    return NextResponse.json({ ok: false, error: "Add your API key first." }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/models`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) {
      const detail = text.slice(0, 200).replace(/\s+/g, " ").trim();
      return NextResponse.json(
        {
          ok: false,
          error: `Provider responded ${res.status}${detail ? `: ${detail}` : ""}. Check the base URL (${base}) and your key.`,
        },
        { status: 502 },
      );
    }
    let data: { data?: { id?: string }[]; models?: { id?: string; name?: string }[] } = {};
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `Expected JSON from ${base}/models but got something else. Is that the right base URL?`,
        },
        { status: 502 },
      );
    }
    const ids = [
      ...(data.data ?? []).map((m) => m.id ?? ""),
      ...(data.models ?? []).map((m) => m.id ?? m.name ?? ""),
    ].filter(Boolean);
    const models = [...new Set(ids)].sort();
    if (!models.length) {
      return NextResponse.json(
        { ok: false, error: "The provider returned no models. Type the model name manually." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return NextResponse.json(
      { ok: false, error: `Could not reach ${base} (${message}).` },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") || "ollama") as LlmProvider;
  return listModels(
    provider,
    url.searchParams.get("baseUrl") || "",
    url.searchParams.get("apiKey") || "",
  );
}

export async function POST(req: Request) {
  let body: { provider?: LlmProvider; baseUrl?: string; apiKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  return listModels(body.provider ?? "ollama", body.baseUrl ?? "", body.apiKey ?? "");
}
