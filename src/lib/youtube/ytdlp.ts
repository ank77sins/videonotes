import youtubeDl from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";

const FFMPEG = (ffmpegPath as unknown as string) || undefined;

type Flags = Record<string, unknown>;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function ytdlpJson(url: string, extra: Flags = {}, timeoutMs = 45000): Promise<any> {
  const flags: Flags = {
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true,
    noPlaylist: true,
    ...(FFMPEG ? { ffmpegLocation: FFMPEG } : {}),
    ...extra,
  };
  const out = (await withTimeout(
    youtubeDl(url, flags as never),
    timeoutMs,
    "yt-dlp metadata",
  )) as unknown as string;
  return JSON.parse(out);
}

export async function ytdlpRun(
  url: string,
  extra: Flags = {},
  timeoutMs = 180000,
): Promise<string> {
  const flags: Flags = {
    noWarnings: true,
    noPlaylist: true,
    ...(FFMPEG ? { ffmpegLocation: FFMPEG } : {}),
    ...extra,
  };
  return (await withTimeout(
    youtubeDl(url, flags as never),
    timeoutMs,
    "yt-dlp",
  )) as unknown as string;
}

export { FFMPEG };
