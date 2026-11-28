import { complete, isConfigured } from "../llm";
import { extractiveKeyPoints, extractiveSummary } from "../llm/extractive";
import type {
  LlmConfig,
  NotesBlock,
  NotesDocument,
  NotesSection,
  NotesSubsection,
  PdfOptions,
  SlideItem,
  TranscriptSegment,
  VideoMeta,
} from "../types";
import { formatTimestamp } from "../youtube/url";

const CHUNK_CHARS = 9000;
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

const LOCAL_MAX_CHUNKS = 8;
const CLOUD_MAX_CHUNKS = 12;
const LOCAL_SINGLE_PASS_CHARS = 24000;
const CLOUD_SINGLE_PASS_CHARS = 90000;
const LOCAL_CONCURRENCY = 2;
const CLOUD_CONCURRENCY = 6;

function isCloud(cfg: LlmConfig): boolean {
  return cfg.provider !== "ollama" && cfg.provider !== "none";
}

function maxChunksFor(cfg: LlmConfig): number {
  return isCloud(cfg) ? CLOUD_MAX_CHUNKS : LOCAL_MAX_CHUNKS;
}

function singlePassCharsFor(cfg: LlmConfig): number {
  return isCloud(cfg) ? CLOUD_SINGLE_PASS_CHARS : LOCAL_SINGLE_PASS_CHARS;
}

function concurrencyFor(cfg: LlmConfig): number {
  return isCloud(cfg) ? CLOUD_CONCURRENCY : LOCAL_CONCURRENCY;
}

function chunkTokensFor(cfg: LlmConfig): number {
  return isCloud(cfg) ? 1400 : 700;
}

function finalTokensFor(cfg: LlmConfig, depth: PdfOptions["depth"]): number {
  const cloud = isCloud(cfg);
  if (depth === "brief") return cloud ? 3500 : 1800;
  if (depth === "detailed") return cloud ? 8000 : 3000;
  return cloud ? 6000 : 2400;
}

function mergeIntoFew(chunks: Chunk[], maxChunks: number): Chunk[] {
  if (chunks.length <= maxChunks) return chunks;
  const per = Math.ceil(chunks.length / maxChunks);
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
      return "Emphasis: a hierarchical outline. Prefer short bullet blocks over paragraphs; nest detail under subsections.";
          return "Emphasis: an ultra-dense exam cheatsheet. Prefer tables and 'Topic | fact, fact, fact' key-value lines over paragraphs. Merge repeated concepts into one line and mark them with a star symbol.";
    case "qa":
      return "Emphasis: a Q&A document. Organise sections as questions with thorough answers, and fill the questions array.";
    default:
      return "Emphasis: detailed lecture notes. Explanatory paragraphs plus bullets, steps and tables.";
  }
}

function depthInstruction(depth: PdfOptions["depth"]): string {
  switch (depth) {
    case "brief":
      return "Length: brief. 3-6 sections. Keep every fact but compress wording hard.";
    case "detailed":
      return "Length: thorough. 6-12 sections, keep examples, numbers and caveats in full.";
    default:
      return "Length: balanced. 4-9 sections.";
  }
}

const CHUNK_SYSTEM = [
  "You are an expert academic tutor creating a high-density study CHEATSHEET.",
  "STRICT RULES:",
  "1. DENSITY: Maximize information density. Use tables, bullet points, and key-value pairs. 1 line of output should replace 6-7 lines of conversational transcript.",
  "2. FORMAT: Use strict Key-Value pairs. Example: 'Lord Dalhousie | Railways (1853), Doctrine of Lapse, Postal Reforms'.",
  "3. REPETITION: If a concept, date, or fact is emphasized or repeated multiple times in the lecture, compile it into a single entry and append a star (⭐). Example: 'Doctrine of Lapse ⭐ (High exam priority)'.",
  "4. NO FLUFF: Do not write introductory or concluding paragraphs. Output pure, structured facts. Remove all conversational filler.",
  "5. ZERO INFORMATION LOSS: Keep every fact, number, name, and date, but compress the wording heavily.",
  "Output Markdown only. No preamble, no commentary.",
].join(" ");

const SYSTEM_PROMPT = [
  "ROLE: You are an expert academic tutor generating a high-density CHEATSHEET from a YouTube transcript.",
  "ABSOLUTE RULES:",
  "1. DENSITY OVER PROSE: Use tables, bullet points, and key-value pairs. Never write long paragraphs. 1 line of output = 6-7 transcript lines.",
  "2. FORMAT: Use strict Key-Value pairs separated by pipes or bold headers. Example: 'Lord Dalhousie | Railways (1853), Doctrine of Lapse, Postal Reforms'.",
  "3. REPETITION TRACKING: If a concept, date, or fact is repeated or emphasized, merge it into one line and append a star (⭐) with a note like '(High exam priority)'.",
  "4. NO FLUFF: Zero intro or conclusion text. Pure facts only. Remove 'welcome to class', sponsor reads, and filler words.",
  "5. ZERO INFORMATION LOSS: Every fact, number, name, and date MUST appear, but heavily compressed.",
  "6. NEVER INVENT: Do not add outside knowledge. Mark garbled ASR as [unclear].",
  "BLOCK TYPES: use table for comparisons, bullets for dense key-value lists, and steps ONLY for exact procedures.",
  "SELF-CHECK before answering: Is it dense enough? Did I use tables or key-value pairs? Did I mark repeated concepts with ⭐? Are there any conversational paragraphs left? (If yes, delete them).",
].join(" ");

const SCHEMA_HINT = [
  "Respond with STRICT JSON only, no prose and no code fences, matching exactly:",
  '{"title": string, "overview": string, "keyTakeaways": string[],',
  '"sections": [{"heading": string, "timestamp": number|null,',
  '"blocks": [{"type":"para","text":string} | {"type":"bullets","items":string[]} | {"type":"steps","items":string[]} | {"type":"table","headers":string[],"rows":string[][]}],',
  '"subsections": [{"heading": string, "blocks": [...]}]}],',
  '"questions": [{"q": string, "a": string}], "excluded": string[]}',
  "overview is 2-4 sentences. keyTakeaways has at most 5 bullets, each a fact from the transcript. timestamp is total seconds or null. questions only for study-guide or qa styles, otherwise [].",
].join(" ");

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
          { role: "system", content: CHUNK_SYSTEM },
          { role: "user", content: chunk.text },
        ],
        { temperature: 0.1, maxTokens: chunkTokensFor(cfg) },
      );
    } catch (err) {
      out[index] = `(the slice starting ${formatTimestamp(chunk.start)} could not be processed)`;
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
    Array.from({ length: Math.min(concurrencyFor(cfg), chunks.length) }, () => worker()),
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

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanList(value: unknown, limit = 400): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, limit);
}

function normalizeBlocks(value: unknown): NotesBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: NotesBlock[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const type = cleanText(item.type).toLowerCase();
    if (type === "para" || type === "paragraph" || type === "text") {
      const text = cleanText(item.text);
      if (text) blocks.push({ type: "para", text });
      continue;
    }
    if (type === "bullets" || type === "list" || type === "bullet") {
      const items = cleanList(item.items ?? item.bullets);
      if (items.length) blocks.push({ type: "bullets", items });
      continue;
    }
    if (type === "steps" || type === "numbered" || type === "ordered") {
      const items = cleanList(item.items ?? item.steps);
      if (items.length) blocks.push({ type: "steps", items });
      continue;
    }
    if (type === "table") {
      const headers = cleanList(item.headers, 6);
      const rows = Array.isArray(item.rows)
        ? item.rows
            .filter((row): row is unknown[] => Array.isArray(row))
            .map((row) => row.map(cleanText).slice(0, headers.length || 6))
            .filter((row) => row.some(Boolean))
        : [];
      if (headers.length && rows.length) blocks.push({ type: "table", headers, rows });
    }
  }
  return blocks;
}

function normalizeSubsections(value: unknown): NotesSubsection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      heading: cleanText(s.heading) || "Details",
      blocks: normalizeBlocks(s.blocks),
    }))
    .filter((s) => s.blocks.length > 0);
}

function normalizeSections(value: unknown): NotesSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => {
      const blocks = normalizeBlocks(s.blocks);
      const bullets = cleanList(s.bullets);
      const legacy: NotesBlock[] = bullets.length ? [{ type: "bullets", items: bullets }] : [];
      return {
        heading: cleanText(s.heading) || "Section",
        timestamp: typeof s.timestamp === "number" ? s.timestamp : undefined,
        bullets,
        blocks: blocks.length ? blocks : legacy,
        subsections: normalizeSubsections(s.subsections),
      };
    })
    .filter((s) => (s.blocks?.length ?? 0) > 0 || (s.subsections?.length ?? 0) > 0);
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
    SYSTEM_PROMPT,
    `Write in ${options.language}. Target reader: ${options.audience}. Tone: ${options.tone}.`,
    styleInstruction(options.style),
    depthInstruction(options.depth),
    options.includeTimestamps
      ? "Set each section's timestamp field to the moment that section starts."
      : "Set every section timestamp to null and do not write timestamps inside the text.",
    SCHEMA_HINT,
  ].join(" ");

  const user = [
    `Video: "${meta.title}" by ${meta.channel}.`,
    "The transcript was processed in order. Rebuild it into one coherent, de-duplicated document: merge overlapping sections, keep the original order of ideas, and state repeated information once in the most logical place.",
    "",
    "Source material:",
    body,
    slidesPromptBlock(slides),
  ].join("\n");

  const raw = await complete(
    cfg,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.2, maxTokens: finalTokensFor(cfg, options.depth) },
  );

  const parsed = safeJson<Record<string, unknown>>(raw);
  if (!parsed) throw new Error("The model did not return valid notes JSON.");

  const sections = normalizeSections(parsed.sections);
  if (!sections.length) throw new Error("The model returned no sections.");

  return {
    title: cleanText(parsed.title) || undefined,
    summary: cleanText(parsed.overview) || cleanText(parsed.summary),
    keyTakeaways: cleanList(parsed.keyTakeaways, 5),
    sections,
    questions: Array.isArray(parsed.questions)
      ? parsed.questions
          .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === "object")
          .map((q) => ({ q: cleanText(q.q), a: cleanText(q.a) }))
          .filter((q) => q.q && q.a)
          .slice(0, 20)
      : [],
    excluded: cleanList(parsed.excluded, 10),
  };
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "you", "your", "are", "was", "but", "not", "have",
  "has", "had", "they", "them", "there", "then", "than", "what", "when", "where", "which", "who",
  "how", "why", "will", "would", "can", "could", "should", "about", "into", "from", "just", "like",
  "get", "got", "one", "two", "also", "because", "really", "very", "much", "some", "more", "most",
  "other", "only", "out", "now", "here", "its", "our", "his", "her", "she", "him", "were", "been",
  "being", "does", "did", "doing", "all", "any", "each", "such", "these", "those",
]);

function labelFromText(text: string, fallback: string): string {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
  return top.length ? top.join(", ") : fallback;
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
      heading: labelFromText(text, `From ${formatTimestamp(start)}`),
      timestamp: start,
      bullets,
      blocks: [{ type: "bullets", items: bullets }],
    });
  }

  const seenHeadings = new Set<string>();
  for (const section of sections) {
    let heading = section.heading;
    if (seenHeadings.has(heading)) {
      heading = `${heading} (${formatTimestamp(section.timestamp ?? 0)})`;
    }
    seenHeadings.add(heading);
    section.heading = heading;
  }

  const described = slides.filter((s) => s.caption || s.ocrText);
  if (described.length) {
    const items = described.map((s) => {
      const label = `[${formatTimestamp(s.timestamp)}]`;
      const content = s.caption || s.ocrText;
      return `${label} ${content}`;
    });
    sections.push({
      heading: "Slides & visuals",
      bullets: items,
      blocks: [{ type: "bullets", items }],
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
  const keyTakeaways = dedupeWithin(extractiveKeyPoints(fullText, 5));
  const dedupedSections = sections
    .map((section) => {
      const bullets = dedupeWithin(section.bullets);
      const kept = bullets.length ? bullets : section.bullets.slice(0, 1);
      return { ...section, bullets: kept, blocks: [{ type: "bullets" as const, items: kept }] };
    })
    .filter((section) => section.bullets.length > 0);

  if (!dedupedSections.length) {
    const fallback = dedupeWithin(extractiveKeyPoints(fullText, 6));
    if (fallback.length) {
      dedupedSections.push({
        heading: "Overview",
        bullets: fallback,
        blocks: [{ type: "bullets", items: fallback }],
      });
    }
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

    if (totalChars <= singlePassCharsFor(cfg)) {
      onProgress?.("Writing notes (single pass)", 10);
      const single = rawChunks.map((c) => c.text).join("\n").slice(0, MAX_TRANSCRIPT_CHARS);
      const notes = await synthesize([single], meta, options, slides, cfg);
      onProgress?.("Writing notes (single pass)", 100);
      return { notes, usedAi: true };
    }

    const chunks = mergeIntoFew(rawChunks, maxChunksFor(cfg));
    onProgress?.(`Structuring ${chunks.length} transcript slices`, 0);
    const chunkNotes = await mapChunks(chunks, cfg, (done, total) =>
      onProgress?.(`Structuring ${total} transcript slices`, Math.round((done / total) * 100)),
    );

    onProgress?.("Assembling final document", 50);
    const notes = await synthesize(chunkNotes, meta, options, slides, cfg);
    onProgress?.("Assembling final document", 100);
    return { notes, usedAi: true };
  } catch (err) {
    onProgress?.("Falling back to basic notes", 100);
    const reason = err instanceof Error ? err.message : "The AI model failed.";
    return { notes: { ...fallback(), warning: reason }, usedAi: false };
  }
}
