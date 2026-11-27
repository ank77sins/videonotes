import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs";
import path from "node:path";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);

export interface RawFrame {
  path: string;
  timestamp: number;
}

function listFrames(dir: string, prefix: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && /\.(jpg|jpeg|png)$/i.test(f))
    .sort();
}

export async function extractFramesToDir(
  videoPath: string,
  outDir: string,
  opts: { maxFrames?: number; sceneThreshold?: number } = {},
): Promise<RawFrame[]> {
  const maxFrames = opts.maxFrames ?? 120;
  const threshold = opts.sceneThreshold ?? 0.3;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const sceneDir = path.join(outDir, "scene");
  fs.mkdirSync(sceneDir, { recursive: true });
  const timestamps: number[] = [];
  const ptsRe = /pts_time:\s*([\d.]+)/;

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          "-vf",
          `select='gt(scene,${threshold})',scale=1280:-2,showinfo`,
          "-vsync",
          "vfr",
          "-frames:v",
          String(maxFrames),
          "-q:v",
          "3",
        ])
        .output(path.join(sceneDir, "scene-%04d.jpg"))
        .on("stderr", (line: string) => {
          const m = ptsRe.exec(line);
          if (m) timestamps.push(Number(m[1]));
        })
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });
  } catch {
    // fall through to interval sampling
  }

  let files = listFrames(sceneDir, "scene-");
  if (files.length >= 4) {
    return files.map((f, i) => ({
      path: path.join(sceneDir, f),
      timestamp: timestamps[i] ?? i * 20,
    }));
  }

  const intervalDir = path.join(outDir, "interval");
  fs.mkdirSync(intervalDir, { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          "-vf",
          "fps=1/20,scale=1280:-2",
          "-frames:v",
          String(maxFrames),
          "-q:v",
          "3",
        ])
        .output(path.join(intervalDir, "interval-%04d.jpg"))
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });
  } catch {
    return [];
  }

  files = listFrames(intervalDir, "interval-");
  return files.map((f, i) => ({ path: path.join(intervalDir, f), timestamp: i * 20 }));
}
