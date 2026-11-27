import sharp from "sharp";
import type { RawFrame } from "./frames";

async function signature(file: string): Promise<number[]> {
  const { data } = await sharp(file)
    .resize(8, 8, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Array.from(data);
}

function distance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export async function dedupeFrames(
  frames: RawFrame[],
  opts: { threshold?: number; maxKeep?: number } = {},
): Promise<RawFrame[]> {
  const threshold = opts.threshold ?? 14;
  const maxKeep = opts.maxKeep ?? 60;
  if (frames.length === 0) return [];

  const sigs: number[][] = [];
  for (const frame of frames) {
    try {
      sigs.push(await signature(frame.path));
    } catch {
      sigs.push([]);
    }
  }

  const kept: RawFrame[] = [];
  let last: number[] | null = null;

  for (let i = 0; i < frames.length; i++) {
    const sig = sigs[i];
    if (!last || sig.length === 0 || distance(sig, last) >= threshold) {
      kept.push(frames[i]);
      if (sig.length) last = sig;
    }
  }

  if (kept.length <= maxKeep) return kept;

  const step = kept.length / maxKeep;
  return Array.from({ length: maxKeep }, (_, i) => kept[Math.floor(i * step)]);
}
