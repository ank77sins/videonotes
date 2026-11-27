import { createWorker, type Worker } from "tesseract.js";
import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "data", "ocr");

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    workerPromise = createWorker("eng", undefined, { cachePath: CACHE_DIR }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function ocrImage(filePath: string): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(filePath);
  return (result.data.text ?? "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

export async function ocrFrames(
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const out: string[] = [];
  let done = 0;
  for (const p of paths) {
    try {
      out.push(await ocrImage(p));
    } catch {
      out.push("");
    }
    done++;
    onProgress?.(done, paths.length);
  }
  return out;
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // ignore
  } finally {
    workerPromise = null;
  }
}
