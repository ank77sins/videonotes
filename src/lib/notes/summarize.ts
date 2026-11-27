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

const MAX_CHUNKS = 8;
const CHUNK_MAX_TOKENS = 400;
const SINGLE_PASS_CHARS = 24000;
const CHUNK_CONCURRENCY = 2;

function mergeIntoFew(chunks: Chunk[]): Chunk[] {
  if (chunks.length <= MAX_CHUNKS) return chunks;
  const groups = MAX_CHUNKS;
  const per = Math.ceil(chunks.length / groups);
  const out: Chunk[] = [];
  for (let i = 0; i < chunks.length; i += per) {
    const slice = chunks.slice(i, i + per);
    out.push({
      text: slice.map((c) => c.text).join("\n"),
      start: slice[0].start,
    });
  }
  return out;
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
  const out: string[] = new Array(chunks.length).fill("");
  let done = 0;

  const summarizeChunk = async (index: number): Promise<void> => {
    const chunk = chunks[index];
    try {
      out[index] = await complete(
        cfg,
        [
          {
            role: "system",
            content:
              "You are an expert note-taker. Extract the key ideas from this section of a video transcript. Keep timestamps like [mm:ss] where useful. Output at most 5 short bullet points, no preamble.",
          },
          { role: "user", content: chunk.text },
        ],
        { temperature: 0.2, maxTokens: CHUNK_MAX_TOKENS },
      );
    } catch (err) {
      out[index] = `(section starting ${formatTimestamp(chunk.start)} could not be summarized)`;
      if (index === 0) throw err;
    }
    done++;
    onProgress?.(done, chunks.length);
  };

  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++;
      await summarizeChunk(index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, () => worker()),
  );
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
    { temperature: 0.3, maxTokens: 2500 },
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
      heading: `Part ${sections.length + 1}`,
      timestamp: start,
      bullets,
    });
  }

  const described = slides.filter((s) => s.caption || s.ocrText);
  if (described.length) {
    sections.push({
      heading: "Slides & visuals",
      bullets: described.map((s) => {
        const label = `[${formatTimestamp(s.timestamp)}]`;
        const content = s.caption || s.ocrText;
        return `${label} ${content}`;
      }),
    });
  }

  const norm = (t: string) => t.toLowerCase().replace(/\W+/g, " ").trim();
  const dedupeWithin = (items: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const key = norm(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const summary =
    extractiveSummary(fullText, options.depth === "brief" ? 4 : 7) || `Notes for ${meta.title}.`;
  const keyTakeaways = dedupeWithin(extractiveKeyPoints(fullText, 8));
  const dedupedSections = sections
    .map((section) => {
      const bullets = dedupeWithin(section.bullets);
      return {
        ...section,
        bullets: bullets.length ? bullets : section.bullets.slice(0, 1),
      };
    })
    .filter((section) => section.bullets.length > 0);

  if (!dedupedSections.length) {
    const fallback = dedupeWithin(extractiveKeyPoints(fullText, 6));
    if (fallback.length) dedupedSections.push({ heading: "Overview", bullets: fallback });
  }

  const questions =
    options.style === "qa"
      ? extractiveKeyPoints(fullText, 6).map((point, i) => ({
          q: `Key point ${i + 1}: what is the main idea?`,
          a: point,
        }))
      : [];

  return {
    summary,
    keyTakeaways,
    sections: dedupedSections,
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
  const fallback = () => extractiveNotes(segments, meta, options, slides);

  if (!isConfigured(cfg)) {
    onProgress?.("Summarizing transcript (basic mode)", 100);
    return { notes: fallback(), usedAi: false };
  }

  try {
    const rawChunks = buildChunks(segments);
    const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);

    if (totalChars <= SINGLE_PASS_CHARS) {
      onProgress?.("Writing notes (single pass)", 10);
      const single = rawChunks.map((c) => c.text).join("\n").slice(0, MAX_TRANSCRIPT_CHARS);
      const notes = await synthesize([single], meta, options, slides, cfg);
      if (!notes.sections.length) throw new Error("The model returned no sections.");
      onProgress?.("Writing notes (single pass)", 100);
      return { notes, usedAi: true };
    }

    const chunks = mergeIntoFew(rawChunks);
    onProgress?.(`Summarizing ${chunks.length} sections`, 0);
    const chunkNotes = await mapChunks(chunks, cfg, (done, total) =>
      onProgress?.(`Summarizing ${total} sections`, Math.round((done / total) * 100)),
    );

    onProgress?.("Writing final notes", 50);
    const notes = await synthesize(chunkNotes, meta, options, slides, cfg);
    if (!notes.sections.length) throw new Error("The model returned no sections.");
    onProgress?.("Writing final notes", 100);
    return { notes, usedAi: true };
  } catch (err) {
    onProgress?.("Falling back to basic notes", 100);
    const reason = err instanceof Error ? err.message : "The AI model failed.";
    return { notes: { ...fallback(), warning: reason }, usedAi: false };
  }
}
