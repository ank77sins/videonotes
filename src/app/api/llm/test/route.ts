import { NextResponse } from "next/server";
import { complete, isConfigured } from "@/lib/llm";
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
    return NextResponse.json({ ok: false, error: "No provider configured." }, { status: 400 });
  }

  try {
    const reply = await complete(
      cfg,
      [
        { role: "system", content: "Reply with the single word: ready" },
        { role: "user", content: "ping" },
      ],
      { temperature: 0, maxTokens: 16 },
    );
    return NextResponse.json({ ok: true, reply: reply.trim().slice(0, 120) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
