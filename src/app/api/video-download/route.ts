import { NextResponse } from "next/server";
import { parseVideoId } from "@/lib/youtube/url";
import { prepareVideoDownload, VIDEO_QUALITIES, type VideoQuality } from "@/lib/youtube/video-download";
import { writeTempCookies } from "@/lib/youtube/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

interface Body {
  url?: string;
  quality?: string;
  title?: string;
  cookies?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const videoId = parseVideoId(body.url ?? "");
  if (!videoId) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a valid YouTube link." },
      { status: 400 },
    );
  }

  const valid = VIDEO_QUALITIES.map((q) => q.value);
  const quality = (valid.includes(body.quality as VideoQuality) ? body.quality : "720p") as VideoQuality;

  const cookies = writeTempCookies(body.cookies);
  try {
    const result = await prepareVideoDownload({
      videoId,
      quality,
      title: body.title,
      cookiesPath: cookies?.path,
    });
    return NextResponse.json({ ok: true, id: result.id, size: result.size });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `Video download failed: ${err.message.slice(0, 200)}`
            : "Video download failed.",
      },
      { status: 502 },
    );
  } finally {
    cookies?.cleanup();
  }
}
