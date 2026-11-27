import { createWorker, type Worker } from "tesseract.js";
import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "data", "ocr");
const MIN_CONFIDENCE = 60;

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

function alnumRatio(text: string): number {
  const visible = text.replace(/\s/g, "");
  if (!visible) return 0;
  const alnum = visible.replace(/[^A-Za-z0-9]/g, "").length;
  return alnum / visible.length;
}

export function cleanOcrText(raw: string, confidence: number): string {
  if (confidence < MIN_CONFIDENCE) return "";
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 4 && alnumRatio(l) >= 0.65);

  const text = lines.join("\n").trim();
  if (!text) return "";

  const words = text.split(/\s+/).filter((w) => /[A-Za-z0-9]{2,}/.test(w));
  if (text.length < 12 || words.length < 3) return "";
  return text;
}

export async function ocrImage(filePath: string): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(filePath);
  return cleanOcrText(result.data.text ?? "", result.data.confidence ?? 0);
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
