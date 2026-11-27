import { NextResponse } from "next/server";
import { startJob } from "@/lib/jobs";
import { DEFAULT_OPTIONS, type LlmConfig, type PdfOptions, type TranscriptSegment, type VideoMeta } from "@/lib/types";
import { parseVideoId } from "@/lib/youtube/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  meta?: VideoMeta;
  segments?: TranscriptSegment[];
  options?: Partial<PdfOptions>;
  llm?: LlmConfig;
  cookies?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (!segments.length) {
    return NextResponse.json(
      { ok: false, error: "No transcript available. Load a transcript first." },
      { status: 400 },
    );
  }

  const url = body.meta?.url ?? "";
  const videoId = parseVideoId(url);
  if (!videoId) {
    return NextResponse.json({ ok: false, error: "Invalid video reference." }, { status: 400 });
  }

  const meta: VideoMeta = {
    videoId,
    title: body.meta?.title || `YouTube video ${videoId}`,
    channel: body.meta?.channel || "Unknown channel",
    thumbnail: body.meta?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: body.meta?.durationSeconds,
    url,
  };

  const options: PdfOptions = { ...DEFAULT_OPTIONS, ...(body.options ?? {}) };
  const llm: LlmConfig = body.llm ?? { provider: "none" };

  const id = startJob({ meta, segments, options, llm, cookies: body.cookies });
  return NextResponse.json({ ok: true, id });
}
