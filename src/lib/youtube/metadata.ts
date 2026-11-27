import type { VideoMeta } from "../types";
import { canonicalUrl, parseVideoId } from "./url";
import { ytdlpJson } from "./ytdlp";

export async function fetchMetadata(input: string, cookiesPath?: string): Promise<VideoMeta | null> {
  const videoId = parseVideoId(input);
  if (!videoId) return null;
  const url = canonicalUrl(videoId);

  let title = "";
  let channel = "";
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let durationSeconds: number | undefined;

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (res.ok) {
      const data = await res.json();
      title = data.title ?? "";
      channel = data.author_name ?? "";
      thumbnail = data.thumbnail_url ?? thumbnail;
    }
  } catch {
    // oEmbed can fail; yt-dlp below may still work
  }

  if (!title || durationSeconds === undefined) {
    try {
      const info = await ytdlpJson(url, cookiesPath ? { cookies: cookiesPath } : {}, 30000);
      title = title || info.title || "";
      channel = channel || info.channel || info.uploader || "";
      thumbnail = info.thumbnail || thumbnail;
      if (typeof info.duration === "number") durationSeconds = info.duration;
    } catch {
      // best effort only
    }
  }

  return {
    videoId,
    title: title || `YouTube video ${videoId}`,
    channel: channel || "Unknown channel",
    thumbnail,
    durationSeconds,
    url,
  };
}
