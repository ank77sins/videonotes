import { complete, isConfigured } from "../llm";
import { extractiveKeyPoints, extractiveSummary } from "../llm/extractive";
import type {
  LlmConfig,
  NotesDocument,
  NotesSection,
  PdfOptions,
  SlideItem,
  TranscriptSegment,
  VideoMeta,
} from "../types";
import { formatTimestamp } from "../youtube/url";

const CHUNK_CHARS = 6000;
const MAX_TRANSCRIPT_CHARS = 120000;

interface Chunk {
  text: string;
  start: number;
}

function buildChunks(segments: TranscriptSegment[]): Chunk[] {
  const chunks: Chunk[] = [];
  let buf = "";
  let start = segments[0]?.start ?? 0;

  for (const seg of segments) {
    if (buf.length === 0) start = seg.start;
    buf += `[${formatTimestamp(seg.start)}] ${seg.text}\n`;
    if (buf.length >= CHUNK_CHARS) {
      chunks.push({ text: buf.trim(), start });
      buf = "";
    }
  }
  if (buf.trim()) chunks.push({ text: buf.trim(), start });
  return chunks;
}

function safeJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  const candidate = first !== -1 && last !== -1 ? cleaned.slice(first, last + 1) : cleaned;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function styleInstruction(style: PdfOptions["style"]): string {
  switch (style) {
    case "outline":
      return "Produce a hierarchical outline: sections with nested bullet points. Keep bullets terse.";
    case "study-guide":
      return "Produce a study guide: clear sections, key concepts explained, definitions, and review questions.";
    case "qa":
      return "Produce a Q&A style document: a series of important questions and thorough answers covering the content.";
    default:
      return "Produce detailed, well-organized lecture notes: sections with explanatory bullet points.";
  }
}

function depthInstruction(depth: PdfOptions["depth"]): string {
  switch (depth) {
    case "brief":
      return "Be concise: 3-6 sections, 3-5 bullets each.";
    case "detailed":
      return "Be thorough: 6-12 sections, 5-9 bullets each, with examples and specifics.";
    default:
      return "Be balanced: 4-8 sections, 4-7 bullets each.";
  }
}

async function mapChunks(
  chunks: Chunk[],
  cfg: LlmConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const notes = await complete(
        cfg,
        [
          {
            role: "system",
            content:
              "You are an expert note-taker. Extract the key ideas from this section of a video transcript. Keep timestamps like [mm:ss] where useful. Output compact bullet points only, no preamble.",
          },
          { role: "user", content: chunk.text },
        ],
        { temperature: 0.2, maxTokens: 1200 },
      );
      out.push(notes);
    } catch (err) {
      out.push(`(section starting ${formatTimestamp(chunk.start)} could not be summarized)`);
      if (i === 0) throw err;
    }
    onProgress?.(i + 1, chunks.length);
  }
  return out;
}

function slidesPromptBlock(slides: SlideItem[]): string {
  if (!slides.length) return "";
  const lines = slides.map((s) => {
    const parts = [`[${formatTimestamp(s.timestamp)}]`];
    if (s.ocrText) parts.push(`text: ${s.ocrText.slice(0, 400)}`);
    if (s.caption) parts.push(`visual: ${s.caption}`);
    return parts.join(" — ");
  });
  return `\n\nSlides captured from the video (timestamp — content):\n${lines.join("\n")}`;
}

async function synthesize(
  chunkNotes: string[],
  meta: VideoMeta,
  options: PdfOptions,
  slides: SlideItem[],
  cfg: LlmConfig,
): Promise<NotesDocument> {
  const body = chunkNotes.join("\n\n").slice(0, MAX_TRANSCRIPT_CHARS);
  const system = [
    "You are an expert educator who turns video content into polished study notes.",
    `Write in ${options.language}. Audience: ${options.audience}. Tone: ${options.tone}.`,
    styleInstruction(options.style),
    depthInstruction(options.depth),
    "Respond with STRICT JSON only, matching this schema:",
    '{"summary": string, "keyTakeaways": string[], "sections": [{"heading": string, "timestamp": number|null, "bullets": string[]}], "questions": [{"q": string, "a": string}]}',
    "timestamp must be total seconds (number) or null. Include questions only for study-guide or qa styles, otherwise an empty array.",
    options.includeTimestamps
      ? "Reference timestamps like [mm:ss] where useful."
      : "Do not include timestamps in the notes.",
  ].join(" ");

  const user = `Video: "${meta.title}" by ${meta.channel}.\n\nSection notes:\n${body}${slidesPromptBlock(slides)}`;

  const raw = await complete(
    cfg,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, maxTokens: 8000 },
  );

  const parsed = safeJson<NotesDocument>(raw);
  if (!parsed || !Array.isArray(parsed.sections)) {
    throw new Error("The model did not return valid notes JSON.");
  }

  return {
    summary: parsed.summary ?? "",
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
    sections: parsed.sections.map((s) => ({
      heading: s.heading ?? "Section",
      timestamp: typeof s.timestamp === "number" ? s.timestamp : undefined,
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
    })),
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
  };
}

function extractiveNotes(
  segments: TranscriptSegment[],
  meta: VideoMeta,
  options: PdfOptions,
  slides: SlideItem[],
): NotesDocument {
  const fullText = segments.map((s) => s.text).join(" ");
  const bucketSeconds = 300;
  const total = segments.length ? segments[segments.length - 1].start : 0;
  const sections: NotesSection[] = [];

  for (let start = 0; start <= total; start += bucketSeconds) {
    const inBucket = segments.filter((s) => s.start >= start && s.start < start + bucketSeconds);
    if (!inBucket.length) continue;
    const text = inBucket.map((s) => s.text).join(" ");
    const bullets = extractiveKeyPoints(text, 6);
    if (!bullets.length) continue;
    sections.push({
      heading: `Part ${sections.length + 1} — ${formatTimestamp(start)}`,
      timestamp: start,
      bullets,
    });
  }

  if (slides.length) {
    sections.push({
      heading: "Slides & visuals",
      bullets: slides.map((s) => {
        const label = `[${formatTimestamp(s.timestamp)}]`;
        const content = s.caption || s.ocrText || "Slide frame captured";
        return `${label} ${content}`;
      }),
    });
  }

  const questions =
    options.style === "qa"
      ? extractiveKeyPoints(fullText, 6).map((point, i) => ({
          q: `Key point ${i + 1}: what is the main idea?`,
          a: point,
        }))
      : [];

  return {
    summary: extractiveSummary(fullText, options.depth === "brief" ? 4 : 7) || `Notes for ${meta.title}.`,
    keyTakeaways: extractiveKeyPoints(fullText, 8),
    sections,
    questions,
  };
}

export async function buildNotes(
  segments: TranscriptSegment[],
  meta: VideoMeta,
  options: PdfOptions,
  slides: SlideItem[],
  cfg: LlmConfig,
  onProgress?: (step: string, pct: number) => void,
): Promise<{ notes: NotesDocument; usedAi: boolean }> {
  if (!isConfigured(cfg)) {
    onProgress?.("Summarizing transcript (basic mode)", 100);
    return { notes: extractiveNotes(segments, meta, options, slides), usedAi: false };
  }

  const chunks = buildChunks(segments);
  onProgress?.("Summarizing transcript sections", 0);
  const chunkNotes = await mapChunks(chunks, cfg, (done, total) =>
    onProgress?.("Summarizing transcript sections", Math.round((done / total) * 100)),
  );

  onProgress?.("Writing final notes", 50);
  const notes = await synthesize(chunkNotes, meta, options, slides, cfg);
  onProgress?.("Writing final notes", 100);
  return { notes, usedAi: true };
}
