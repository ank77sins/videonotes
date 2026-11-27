import fs from "node:fs";
import path from "node:path";
import { canonicalUrl } from "./url";
import { ytdlpRun } from "./ytdlp";

export async function downloadVideo(
  videoId: string,
  outDir: string,
  onProgress?: (pct: number) => void,
  cookiesPath?: string,
): Promise<string> {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outTemplate = path.join(outDir, "video.%(ext)s");

  onProgress?.(5);
  await ytdlpRun(
    canonicalUrl(videoId),
    {
      format: "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[height<=480]/b",
      mergeOutputFormat: "mp4",
      output: outTemplate,
      noWarnings: true,
      noPlaylist: true,
      ...(cookiesPath ? { cookies: cookiesPath } : {}),
    },
    600000,
  );
  onProgress?.(100);

  const files = fs.readdirSync(outDir).filter((f) => f.startsWith("video."));
  const match = files.find((f) => /\.(mp4|mkv|webm)$/i.test(f));
  if (!match) throw new Error("Video download produced no output file.");
  return path.join(outDir, match);
}
