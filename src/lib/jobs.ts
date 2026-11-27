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

  void runJob(id, input).catch((err) => {
    updateJob(id, {
      status: "error",
      step: "Failed",
      error: err instanceof Error ? err.message : "Unknown error",
      message: null,
    });
  });

  return id;
}

async function runJob(id: string, input: StartJobInput): Promise<void> {
  const { meta, segments, options, llm } = input;

  const progress = (pct: number, step: string, message?: string) => {
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

      progress(22, "Detecting slides", "Finding slide changes");
      const frames = await extractFramesToDir(videoPath, path.join(workDir, "frames"), {
        maxFrames: 120,
      });

      progress(34, "Removing duplicates", `Comparing ${frames.length} frames`);
      const unique = await dedupeFrames(frames, { maxKeep: 60 });

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
          captions = await captionSlides(
            baseSlides.map((s) => ({ path: s.imagePath, ocrText: s.ocrText, timestamp: s.timestamp })),
            llm,
            (done, total) => progress(60 + (done / Math.max(1, total)) * 15, "Describing slides"),
          );
        } catch {
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
      progress(70, "Skipping slides", err instanceof Error ? err.message : "Slide capture failed");
    } finally {
      cookies?.cleanup();
    }
  }

  progress(72, "Writing notes", "Summarizing the transcript");
  const { notes, usedAi } = await buildNotes(segments, meta, options, slides, llm, (step, pct) =>
    progress(72 + pct * 0.18, step),
  );

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

  updateJob(id, { pdfPath: outPath, status: "done", progress: 100, step: "Done", message: null });
  void terminateOcr();

  try {
    fs.rmSync(path.join(FRAME_DIR, id), { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}
