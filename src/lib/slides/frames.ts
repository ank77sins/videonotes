import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

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

export function probeDuration(videoPath: string): Promise<number> {
  if (!ffmpegPath) return Promise.resolve(0);
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath as unknown as string, ["-hide_banner", "-i", videoPath]);
    let seconds = 0;
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(buffer);
      if (m && seconds === 0) {
        seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      }
    };
    proc.stderr.on("data", onData);
    proc.on("error", () => resolve(seconds));
    proc.on("close", () => resolve(seconds));
  });
}

function capture(
  videoPath: string,
  outDir: string,
  prefix: string,
  filter: string,
  maxFrames: number,
  onStderr?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .outputOptions(["-vf", filter, "-vsync", "vfr", "-frames:v", String(maxFrames), "-q:v", "3"])
      .output(path.join(outDir, `${prefix}-%04d.jpg`));
    if (onStderr) cmd.on("stderr", onStderr);
    cmd
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

export async function extractFramesToDir(
  videoPath: string,
  outDir: string,
  opts: { maxFrames?: number; sceneThreshold?: number; targetFrames?: number } = {},
): Promise<RawFrame[]> {
  const maxFrames = opts.maxFrames ?? 120;
  const targetFrames = Math.min(opts.targetFrames ?? 40, maxFrames);
  const threshold = opts.sceneThreshold ?? 0.3;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const duration = await probeDuration(videoPath);

  const sceneDir = path.join(outDir, "scene");
  fs.mkdirSync(sceneDir, { recursive: true });
  const timestamps: number[] = [];
  const ptsRe = /pts_time:\s*([\d.]+)/;

  try {
    await capture(
      videoPath,
      sceneDir,
      "scene",
      `select='gt(scene,${threshold})',scale=1280:-2,showinfo`,
      maxFrames,
      (line) => {
        const m = ptsRe.exec(line);
        if (m) timestamps.push(Number(m[1]));
      },
    );
  } catch {
    // fall through to interval sampling
  }

  const sceneFiles = listFrames(sceneDir, "scene-");
  if (sceneFiles.length >= 3) {
    return sceneFiles.map((f, i) => ({
      path: path.join(sceneDir, f),
      timestamp: timestamps[i] ?? (duration ? (i / sceneFiles.length) * duration : i * 10),
    }));
  }

  const intervalDir = path.join(outDir, "interval");
  fs.mkdirSync(intervalDir, { recursive: true });
  const safeDuration = duration > 0 ? duration : 60;
  const fps = Math.min(2, Math.max(1 / 60, targetFrames / safeDuration));
  const interval = 1 / fps;

  try {
    await capture(
      videoPath,
      intervalDir,
      "interval",
      `fps=${fps.toFixed(4)},scale=1280:-2`,
      maxFrames,
    );
  } catch {
    return [];
  }

  const files = listFrames(intervalDir, "interval-");
  return files.map((f, i) => ({
    path: path.join(intervalDir, f),
    timestamp: Math.min(i * interval + interval / 2, safeDuration),
  }));
}
