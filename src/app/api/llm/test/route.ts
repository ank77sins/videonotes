import { NextResponse } from "next/server";
import { isConfigured, testProvider } from "@/lib/llm";
import type { LlmConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let cfg: LlmConfig;
  try {
    const body = (await req.json()) as { llm?: LlmConfig };
    cfg = body.llm ?? { provider: "none" };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!isConfigured(cfg)) {
    const message =
      cfg.provider === "custom"
        ? "Add your API base URL, key and model first."
        : cfg.provider === "none"
          ? "Choose a provider first."
          : "Add your API key first.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    const reply = await testProvider(cfg);
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
