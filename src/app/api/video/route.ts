import { NextResponse } from "next/server";
import type { TranscriptSegment, VideoMeta } from "@/lib/types";
import { getCachedTranscript, saveCachedTranscript } from "@/lib/db";
import { parseVideoId } from "@/lib/youtube/url";
import { fetchMetadata } from "@/lib/youtube/metadata";
import { fetchTranscript, parseSubtitles, segmentsToText } from "@/lib/youtube/transcript";
import { writeTempCookies } from "@/lib/youtube/cookies";
import { classifyYoutubeError } from "@/lib/youtube/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface CachedVideo {
  meta: VideoMeta;
  source: string;
  segments: TranscriptSegment[];
  text: string;
}

function manualToSegments(raw: string): TranscriptSegment[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (/-->/.test(trimmed) || /<text|<transcript/i.test(trimmed)) {
    return parseSubtitles(trimmed);
  }
  const sentences = trimmed
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const segments: TranscriptSegment[] = [];
  let buffer: string[] = [];
  let words = 0;
  const WPS = 2.6;
  let cumulative = 0;
  for (const sentence of sentences) {
    buffer.push(sentence);
    words += sentence.split(/\s+/).length;
    if (words >= 18) {
      const text = buffer.join(" ");
      const dur = Math.max(2, words / WPS);
      segments.push({ start: cumulative, duration: dur, text });
      cumulative += dur;
      buffer = [];
      words = 0;
    }
  }
  if (buffer.length) {
    const text = buffer.join(" ");
    const dur = Math.max(2, words / WPS);
    segments.push({ start: cumulative, duration: dur, text });
  }
  return segments;
}

export async function POST(req: Request) {
  let body: { url?: string; cookies?: string; manualTranscript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const url = body.url?.trim() ?? "";
  const videoId = parseVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a valid YouTube link or video ID." },
      { status: 400 },
    );
  }

  const cookies = writeTempCookies(body.cookies);
  try {
    if (!body.manualTranscript?.trim()) {
      const cached = getCachedTranscript<CachedVideo>(videoId);
      if (cached?.segments?.length) {
        return NextResponse.json({
          ok: true,
          meta: cached.meta,
          source: cached.source,
          hasTranscript: true,
          segments: cached.segments,
          text: cached.text,
          cached: true,
        });
      }
    }

    const meta = await fetchMetadata(videoId, cookies?.path);

    if (body.manualTranscript?.trim()) {
      const segments = manualToSegments(body.manualTranscript);
      if (!segments.length) {
        return NextResponse.json(
          { ok: false, error: "Could not read any text from the pasted transcript." },
          { status: 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        meta,
        source: "manual",
        hasTranscript: true,
        segments,
        text: segmentsToText(segments),
      });
    }

    const { segments, source, error } = await fetchTranscript(videoId, cookies?.path);

    if (!segments.length) {
      return NextResponse.json({
        ok: true,
        meta,
        source,
        hasTranscript: false,
        segments: [],
        text: "",
        reason: error
          ? `${error.message} ${error.guidance}`
          : "YouTube didn't return captions for this video. Paste the transcript, or upload an .srt/.vtt file, or add cookies to continue.",
        errorKind: error?.kind ?? "unknown",
      });
    }

    const text = segmentsToText(segments);
    saveCachedTranscript(videoId, { meta, source, segments, text });

    return NextResponse.json({
      ok: true,
      meta,
      source,
      hasTranscript: true,
      segments,
      text,
    });
  } catch (err) {
    const classified = classifyYoutubeError(err);
    return NextResponse.json(
      {
        ok: false,
        errorKind: classified.kind,
        guidance: classified.guidance,
        error: `${classified.message} ${classified.guidance}`,
      },
      { status: 500 },
    );
  } finally {
    cookies?.cleanup();
  }
}
