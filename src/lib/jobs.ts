import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FRAME_DIR, PDF_DIR, insertJob, updateJob } from "./db";
import { buildNotes } from "./notes/summarize";
import { renderPdf } from "./pdf/render";
import { dedupeFrames } from "./slides/dedupe";
import { extractFramesToDir } from "./slides/frames";
import { ocrFrames, terminateOcr } from "./slides/ocr";
import { captionSlides } from "./slides/vision";
import { downloadVideo } from "./youtube/download";
import { writeTempCookies } from "./youtube/cookies";
import type {
  JobRecord,
  LlmConfig,
  PdfOptions,
  SlideItem,
  TranscriptSegment,
  VideoMeta,
} from "./types";

export interface StartJobInput {
  meta: VideoMeta;
  segments: TranscriptSegment[];
  options: PdfOptions;
  llm: LlmConfig;
  cookies?: string;
}

const MAX_CONCURRENT = 2;

export class CancelledError extends Error {
  constructor() {
    super("Job cancelled.");
    this.name = "CancelledError";
  }
}

const globalForJobs = globalThis as unknown as {
  __ytpdfCancelled?: Set<string>;
  __ytpdfRunning?: number;
  __ytpdfQueue?: (() => void)[];
};

const cancelled: Set<string> = globalForJobs.__ytpdfCancelled ?? new Set();
globalForJobs.__ytpdfCancelled = cancelled;

const queue: (() => void)[] = globalForJobs.__ytpdfQueue ?? [];
globalForJobs.__ytpdfQueue = queue;

let running: number = globalForJobs.__ytpdfRunning ?? 0;

export function cancelJob(id: string): boolean {
  cancelled.add(id);
  return true;
}

export function isCancelled(id: string): boolean {
  return cancelled.has(id);
}

function checkCancelled(id: string): void {
  if (cancelled.has(id)) throw new CancelledError();
}

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      running++;
      resolve();
    });
  });
}

function release(): void {
  running = Math.max(0, running - 1);
  const next = queue.shift();
  if (next) next();
}

export function startJob(input: StartJobInput): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  const record: JobRecord = {
    id,
    url: input.meta.url,
    videoId: input.meta.videoId,
    title: input.meta.title,
    channel: input.meta.channel,
    thumbnail: input.meta.thumbnail,
    duration: input.meta.durationSeconds ?? null,
    status: "queued",
    step: "Queued",
    progress: 0,
    message: null,
    options: JSON.stringify(input.options),
    error: null,
    pdfPath: null,
    slidesCount: 0,
    provider: input.llm.provider,
    createdAt: now,
    updatedAt: now,
  };
  insertJob(record);

  void (async () => {
    const heartbeat = setInterval(() => {
      try {
        updateJob(id, {});
      } catch {
        // best effort
      }
    }, 20_000);
    if (typeof heartbeat.unref === "function") heartbeat.unref();

    await acquire();
    try {
      checkCancelled(id);
      updateJob(id, { status: "running", step: "Starting", progress: 1 });
      await runJob(id, input);
    } catch (err) {
      if (err instanceof CancelledError) {
        updateJob(id, {
          status: "cancelled",
          step: "Cancelled",
          error: null,
          message: null,
        });
      } else {
        updateJob(id, {
          status: "error",
          step: "Failed",
          error: err instanceof Error ? err.message : "Unknown error",
          message: null,
        });
      }
      cleanupWorkDir(id);
    } finally {
      clearInterval(heartbeat);
      cancelled.delete(id);
      release();
    }
  })();

  return id;
}

function cleanupWorkDir(id: string): void {
  try {
    fs.rmSync(path.join(FRAME_DIR, id), { recursive: true, force: true });
  } catch {
    // best effort
  }
}

async function runJob(id: string, input: StartJobInput): Promise<void> {
  const { meta, segments, options, llm } = input;

  const progress = (pct: number, step: string, message?: string) => {
    checkCancelled(id);
    updateJob(id, {
      status: pct >= 100 ? "done" : "running",
      progress: Math.min(100, Math.round(pct)),
      step,
      message: message ?? null,
    });
  };

  progress(3, "Preparing", "Setting up your notes");

  let slides: SlideItem[] = [];

  if (options.includeSlides) {
    const cookies = writeTempCookies(input.cookies);
    const workDir = path.join(FRAME_DIR, id);
    try {
      progress(8, "Downloading video", "Fetching the video for slide capture");
      const videoPath = await downloadVideo(
        meta.videoId,
        workDir,
        (pct) => progress(8 + pct * 0.12, "Downloading video"),
        cookies?.path,
      );

      checkCancelled(id);
      progress(22, "Detecting slides", "Finding slide changes");
      const frames = await extractFramesToDir(videoPath, path.join(workDir, "frames"), {
        maxFrames: 120,
      });

      checkCancelled(id);
      progress(34, "Removing duplicates", `Comparing ${frames.length} frames`);
      const unique = await dedupeFrames(frames, { maxKeep: 60 });

      checkCancelled(id);
      progress(40, "Reading slide text", `OCR on ${unique.length} slides`);
      const ocrTexts = await ocrFrames(
        unique.map((f) => f.path),
        (done, total) => progress(40 + (done / Math.max(1, total)) * 20, "Reading slide text"),
      );

      const baseSlides: SlideItem[] = unique.map((f, i) => ({
        index: i,
        timestamp: f.timestamp,
        imagePath: f.path,
        ocrText: ocrTexts[i] ?? "",
        caption: "",
      }));

      let captions: string[] = baseSlides.map(() => "");
      if (llm.provider === "ollama" || (llm.provider !== "none" && llm.apiKey)) {
        try {
          checkCancelled(id);
          captions = await captionSlides(
            baseSlides.map((s) => ({ path: s.imagePath, ocrText: s.ocrText, timestamp: s.timestamp })),
            llm,
            (done, total) => progress(60 + (done / Math.max(1, total)) * 15, "Describing slides"),
          );
        } catch (err) {
          if (err instanceof CancelledError) throw err;
          // captions are optional
        }
      }

      slides = baseSlides.map((s, i) => ({ ...s, caption: captions[i] ?? "" }));
      updateJob(id, { slidesCount: slides.length });
      try {
        fs.rmSync(videoPath, { force: true });
      } catch {
        // ignore
      }
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      progress(70, "Skipping slides", err instanceof Error ? err.message : "Slide capture failed");
    } finally {
      cookies?.cleanup();
    }
  }

  checkCancelled(id);
  progress(72, "Writing notes", "Summarizing the transcript");
  const { notes, usedAi } = await buildNotes(segments, meta, options, slides, llm, (step, pct) =>
    progress(72 + pct * 0.18, step),
  );

  checkCancelled(id);
  progress(92, "Building PDF", "Laying out your document");
  const outPath = path.join(PDF_DIR, `${id}.pdf`);
  await renderPdf({
    notes,
    meta,
    options,
    slides,
    transcript: segments,
    usedAi,
    outPath,
  });

  const warning = !usedAi && notes.warning
    ? `AI notes failed (${notes.warning.slice(0, 140)}). This PDF uses basic offline notes.`
    : null;
  updateJob(id, { pdfPath: outPath, status: "done", progress: 100, step: "Done", message: warning });
  void terminateOcr();
  cleanupWorkDir(id);
}
