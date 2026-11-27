import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (url.searchParams.get("baseUrl") || "http://localhost:11434").replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Ollama responded ${res.status}. Is it running?` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    return NextResponse.json({ ok: true, models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach Ollama.";
    return NextResponse.json(
      { ok: false, error: `Could not reach Ollama at ${base}. Is it running? (${message})` },
      { status: 502 },
    );
  }
}
