import sharp from "sharp";
import type { RawFrame } from "./frames";

async function averageHash(file: string): Promise<number[]> {
  const { data } = await sharp(file)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  return Array.from(data).map((v) => (v >= avg ? 1 : 0));
}

function hamming(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export async function dedupeFrames(
  frames: RawFrame[],
  opts: { minDistance?: number; maxKeep?: number } = {},
): Promise<RawFrame[]> {
  const minDistance = opts.minDistance ?? 6;
  const maxKeep = opts.maxKeep ?? 60;
  if (frames.length === 0) return [];

  const hashes: number[][] = [];
  for (const frame of frames) {
    try {
      hashes.push(await averageHash(frame.path));
    } catch {
      hashes.push([]);
    }
  }

  const kept: RawFrame[] = [];
  let lastHash: number[] | null = null;

  for (let i = 0; i < frames.length; i++) {
    const h = hashes[i];
    if (!lastHash || h.length === 0 || hamming(h, lastHash) >= minDistance) {
      kept.push(frames[i]);
      lastHash = h.length ? h : lastHash;
    }
  }

  if (kept.length <= maxKeep) return kept;

  const step = kept.length / maxKeep;
  return Array.from({ length: maxKeep }, (_, i) => kept[Math.floor(i * step)]);
}
