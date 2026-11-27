import PDFDocument from "pdfkit";
import fs from "node:fs";
import sharp from "sharp";
import type {
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
import { registerFonts, type RegisteredFonts } from "./fonts";
import { writeText } from "./text";

const COLORS = {
  ink: "#111827",
  muted: "#6b7280",
  accent: "#4f46e5",
  rule: "#e5e7eb",
  cover: "#111827",
  coverAccent: "#a5b4fc",
};

const PAGE = { size: "A4" as const, margin: 56 };
const CONTENT_WIDTH = 595.28 - PAGE.margin * 2;

export interface RenderInput {
  notes: NotesDocument;
  meta: VideoMeta;
  options: PdfOptions;
  slides: SlideItem[];
  transcript: TranscriptSegment[];
  usedAi: boolean;
  outPath: string;
}

function pageBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - PAGE.margin;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > pageBottom(doc)) doc.addPage();
}

function heading(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, text: string, size = 18): void {
  ensureSpace(doc, 48);
  doc.moveDown(0.6);
  writeText(doc, fonts, text, {
    x: PAGE.margin,
    width: CONTENT_WIDTH,
    size,
    bold: true,
    color: COLORS.ink,
    lineGap: 2,
  });
  doc.moveDown(0.35);
  doc
    .strokeColor(COLORS.rule)
    .lineWidth(1)
    .moveTo(PAGE.margin, doc.y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

function bullet(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, text: string): void {
  ensureSpace(doc, 24);
  const y = doc.y;
  doc.fillColor(COLORS.accent).font(fonts.bodyBold).fontSize(10).text("•", PAGE.margin, y, {
    width: 14,
    continued: false,
  });
  writeText(doc, fonts, text, {
    x: PAGE.margin + 16,
    y,
    width: CONTENT_WIDTH - 16,
    size: 10.5,
    color: COLORS.ink,
    lineGap: 2,
  });
  doc.moveDown(0.25);
}

function stripBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*\*/g, "");
}

function writeRich(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  text: string,
  opts: { x?: number; y?: number; width: number; size?: number; bold?: boolean; color?: string; lineGap?: number; align?: "left" | "center" | "right" | "justify" },
): void {
  const clean = text.trim();
  if (!clean) return;
  const hasBold = clean.includes("**");
  const nonLatin = /[^\u0000-\u024F\u2010-\u2027]/.test(clean);
  if (!hasBold || nonLatin) {
    writeText(doc, fonts, stripBold(clean), { ...opts, bold: opts.bold });
    return;
  }

  const parts = clean.split("**");
  const lastNonEmpty = parts.reduce((acc, part, i) => (part ? i : acc), 0);
  const size = opts.size ?? 10.5;
  let first = true;

  parts.forEach((part, index) => {
    if (!part) return;
    const bold = index % 2 === 1 || Boolean(opts.bold);
    doc.font(bold ? fonts.bodyBold : fonts.body).fontSize(size);
    if (opts.color) doc.fillColor(opts.color);
    const options: PDFKit.Mixins.TextOptions = {
      width: opts.width,
      lineGap: opts.lineGap ?? 2,
      align: opts.align ?? "left",
      continued: index !== lastNonEmpty,
    };
    if (first) {
      doc.text(part, opts.x ?? doc.x, opts.y ?? doc.y, options);
      first = false;
    } else {
      doc.text(part, options);
    }
  });
}

function para(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, text: string): void {
  ensureSpace(doc, 30);
  writeRich(doc, fonts, text, {
    width: CONTENT_WIDTH,
    size: 10.5,
    color: COLORS.ink,
    lineGap: 2.5,
  });
  doc.moveDown(0.35);
}

function steps(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, items: string[]): void {
  items.forEach((item, index) => {
    ensureSpace(doc, 24);
    const y = doc.y;
    doc.fillColor(COLORS.accent).font(fonts.bodyBold).fontSize(10).text(`${index + 1}.`, PAGE.margin, y, {
      width: 18,
      continued: false,
    });
    writeRich(doc, fonts, item, {
      x: PAGE.margin + 20,
      y,
      width: CONTENT_WIDTH - 20,
      size: 10.5,
      color: COLORS.ink,
      lineGap: 2,
    });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.15);
}

function table(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  headers: string[],
  rows: string[][],
): void {
  const cols = headers.length;
  const padding = 6;
  const colWidth = CONTENT_WIDTH / cols;
  const fontSize = cols > 4 ? 8.5 : 9.5;

  const rowHeight = (cells: string[], bold: boolean): number => {
    let max = 0;
    for (let i = 0; i < cols; i++) {
      const cell = cells[i] ?? "";
      const h = doc
        .font(bold ? fonts.bodyBold : fonts.body)
        .fontSize(fontSize)
        .heightOfString(cell || " ", { width: colWidth - padding * 2 });
      max = Math.max(max, h);
    }
    return max + padding * 2;
  };

  const drawRow = (cells: string[], bold: boolean, fill?: string) => {
    const h = rowHeight(cells, bold);
    ensureSpace(doc, h + 4);
    const top = doc.y;
    if (fill) doc.rect(PAGE.margin, top, CONTENT_WIDTH, h).fill(fill);
    for (let i = 0; i < cols; i++) {
      const cell = stripBold(cells[i] ?? "");
      doc
        .fillColor(COLORS.ink)
        .font(bold ? fonts.bodyBold : fonts.body)
        .fontSize(fontSize)
        .text(cell, PAGE.margin + i * colWidth + padding, top + padding, {
          width: colWidth - padding * 2,
          lineGap: 1.5,
        });
    }
    doc.y = top + h;
    doc
      .strokeColor(COLORS.rule)
      .lineWidth(0.7)
      .moveTo(PAGE.margin, doc.y)
      .lineTo(PAGE.margin + CONTENT_WIDTH, doc.y)
      .stroke();
    doc.y += 0.5;
  };

  ensureSpace(doc, 40);
  drawRow(headers, true, "#f3f4f6");
  rows.forEach((row) => drawRow(row, false));
  doc.moveDown(0.6);
}

function renderBlocks(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  blocks: NotesBlock[] | undefined,
): void {
  if (!blocks?.length) return;
  for (const block of blocks) {
    if (block.type === "para") para(doc, fonts, block.text);
    else if (block.type === "bullets") block.items.forEach((item) => bullet(doc, fonts, item));
    else if (block.type === "steps") steps(doc, fonts, block.items);
    else if (block.type === "table") table(doc, fonts, block.headers, block.rows);
  }
}

function subsections(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  list: NotesSubsection[] | undefined,
): void {
  if (!list?.length) return;
  for (const sub of list) {
    ensureSpace(doc, 40);
    doc.moveDown(0.2);
    writeRich(doc, fonts, sub.heading, {
      width: CONTENT_WIDTH,
      size: 11.5,
      bold: true,
      color: COLORS.ink,
    });
    doc.moveDown(0.25);
    renderBlocks(doc, fonts, sub.blocks);
  }
}

function sectionBody(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  section: NotesSection,
): void {
  if (section.blocks?.length) renderBlocks(doc, fonts, section.blocks);
  else section.bullets.forEach((b) => bullet(doc, fonts, b));
  subsections(doc, fonts, section.subsections);
}

function cover(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, input: RenderInput): void {
  const { meta, options } = input;
  const w = doc.page.width;
  const h = doc.page.height;
  doc.rect(0, 0, w, h).fill(COLORS.cover);
  doc.rect(0, h - 8, w, 8).fill(COLORS.accent);

  const title = options.coverTitle?.trim() || meta.title;
  writeText(doc, fonts, title, {
    x: PAGE.margin,
    y: 150,
    width: w - PAGE.margin * 2,
    size: 30,
    bold: true,
    color: "#ffffff",
    lineGap: 4,
  });

  doc.y = Math.max(doc.y, 150 + 60);
  doc.moveDown(0.6);
  writeText(doc, fonts, meta.channel, {
    x: PAGE.margin,
    width: w - PAGE.margin * 2,
    size: 13,
    color: COLORS.coverAccent,
  });
  if (meta.durationSeconds) {
    doc.moveDown(0.2);
    writeText(doc, fonts, `Duration ${formatTimestamp(meta.durationSeconds)}`, {
      x: PAGE.margin,
      width: w - PAGE.margin * 2,
      size: 11,
      color: "#cbd5e1",
    });
  }

  writeText(
    doc,
    fonts,
    `${input.usedAi ? "AI-generated" : "Basic (offline)"} study notes  •  ${input.options.language}  •  ${input.options.style.replace("-", " ")}`,
    {
      x: PAGE.margin,
      y: h - 150,
      width: w - PAGE.margin * 2,
      size: 11,
      color: "#e5e7eb",
    },
  );

  if (options.author?.trim()) {
    writeText(doc, fonts, `Prepared by ${options.author}`, {
      x: PAGE.margin,
      y: h - 120,
      width: w - PAGE.margin * 2,
      size: 10,
      color: "#9ca3af",
    });
  }
  writeText(doc, fonts, meta.url, {
    x: PAGE.margin,
    y: h - 100,
    width: w - PAGE.margin * 2,
    size: 9,
    color: "#6b7280",
  });
  if (input.notes.warning) {
    writeText(
      doc,
      fonts,
      `Note: AI notes were unavailable (${input.notes.warning.slice(0, 160)}). These notes were generated offline instead.`,
      {
        x: PAGE.margin,
        y: h - 78,
        width: w - PAGE.margin * 2,
        size: 8,
        color: "#9ca3af",
      },
    );
  }
  doc.addPage();
}

function contents(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  notes: NotesDocument,
  includeTimestamps: boolean,
): void {
  heading(doc, fonts, "Contents", 20);
  notes.sections.forEach((s, i) => {
    const label =
      includeTimestamps && s.timestamp !== undefined
        ? `${formatTimestamp(s.timestamp)}  ·  ${s.heading}`
        : s.heading;
    writeText(doc, fonts, `${i + 1}.  ${label}`, {
      x: PAGE.margin,
      width: CONTENT_WIDTH,
      size: 11,
      color: COLORS.ink,
    });
    doc.moveDown(0.15);
  });
}

async function slidesGallery(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  slides: SlideItem[],
): Promise<void> {
  if (!slides.length) return;
  doc.addPage();
  heading(doc, fonts, "Slides & Visuals", 20);
  for (const slide of slides) {
    try {
      if (!fs.existsSync(slide.imagePath)) continue;
      const info = await sharp(slide.imagePath).metadata();
      const iw = info.width ?? CONTENT_WIDTH;
      const ih = info.height ?? 300;
      const maxW = CONTENT_WIDTH;
      const maxH = 300;
      const scale = Math.min(maxW / iw, maxH / ih, 1);
      const drawW = iw * scale;
      const drawH = ih * scale;

      ensureSpace(doc, drawH + 70);
      const x = PAGE.margin + (CONTENT_WIDTH - drawW) / 2;
      doc.image(slide.imagePath, x, doc.y, { width: drawW, height: drawH });
      doc.y += drawH + 6;

      const label = `Slide ${slide.index + 1}  ·  ${formatTimestamp(slide.timestamp)}`;
      writeText(doc, fonts, label, {
        x: PAGE.margin,
        width: CONTENT_WIDTH,
        size: 9,
        bold: true,
        color: COLORS.muted,
      });
      doc.moveDown(0.2);

      const caption = slide.caption || slide.ocrText;
      if (caption) {
        writeText(doc, fonts, caption, {
          x: PAGE.margin,
          width: CONTENT_WIDTH,
          size: 10,
          color: COLORS.ink,
          lineGap: 2,
        });
      }
      doc.moveDown(0.8);
    } catch {
      // skip broken image
    }
  }
}

function questions(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, notes: NotesDocument): void {
  if (!notes.questions?.length) return;
  heading(doc, fonts, "Review Questions", 18);
  notes.questions.forEach((qa, i) => {
    ensureSpace(doc, 40);
    writeText(doc, fonts, `Q${i + 1}. ${qa.q}`, {
      x: PAGE.margin,
      width: CONTENT_WIDTH,
      size: 11,
      bold: true,
      color: COLORS.ink,
    });
    doc.moveDown(0.15);
    writeText(doc, fonts, `A. ${qa.a}`, {
      x: PAGE.margin,
      width: CONTENT_WIDTH,
      size: 10,
      color: COLORS.muted,
      lineGap: 2,
    });
    doc.moveDown(0.6);
  });
}

function transcriptAppendix(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  segments: TranscriptSegment[],
): void {
  if (!segments.length) return;
  doc.addPage();
  heading(doc, fonts, "Full Transcript", 20);
  for (const seg of segments) {
    ensureSpace(doc, 20);
    const y = doc.y;
    writeText(doc, fonts, formatTimestamp(seg.start), {
      x: PAGE.margin,
      y,
      width: 42,
      size: 8.5,
      bold: true,
      color: COLORS.accent,
    });
    writeText(doc, fonts, seg.text, {
      x: PAGE.margin + 46,
      y,
      width: CONTENT_WIDTH - 46,
      size: 9.5,
      color: COLORS.ink,
      lineGap: 1.5,
    });
    doc.moveDown(0.15);
  }
}

function addFooters(doc: PDFKit.PDFDocument, fonts: RegisteredFonts, title: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === range.start) continue;
    const prevBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(COLORS.muted)
      .font(fonts.body)
      .fontSize(8)
      .text(title.slice(0, 60), PAGE.margin, doc.page.height - 34, {
        width: CONTENT_WIDTH * 0.7,
        lineBreak: false,
      });
    doc.text(`${i + 1}`, PAGE.margin, doc.page.height - 34, {
      width: CONTENT_WIDTH,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = prevBottom;
  }
}

export async function renderPdf(input: RenderInput): Promise<void> {
  const { notes, meta, options, slides, transcript, usedAi } = input;

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    info: {
      Title: options.coverTitle?.trim() || meta.title,
      Author: options.author || meta.channel,
      Subject: "Video study notes",
    },
  });

  const fonts = registerFonts(doc);

  const stream = fs.createWriteStream(input.outPath);
  doc.pipe(stream);

  cover(doc, fonts, input);
  contents(doc, fonts, notes, options.includeTimestamps);

  doc.addPage();
  heading(doc, fonts, options.coverTitle?.trim() || notes.title || meta.title, 20);
  writeText(doc, fonts, `${meta.channel}  ·  ${meta.url}`, {
    x: PAGE.margin,
    width: CONTENT_WIDTH,
    size: 9,
    color: COLORS.muted,
  });
  doc.moveDown(0.4);

  if (notes.summary) {
    writeText(doc, fonts, notes.summary, {
      x: PAGE.margin,
      width: CONTENT_WIDTH,
      size: 11,
      color: COLORS.ink,
      lineGap: 3,
    });
    doc.moveDown(0.6);
  }

  if (notes.keyTakeaways.length) {
    heading(doc, fonts, "Key Takeaways", 15);
    notes.keyTakeaways.forEach((t) => bullet(doc, fonts, t));
    doc.moveDown(0.4);
  }

  notes.sections.forEach((section) => {
    const title =
      options.includeTimestamps && section.timestamp !== undefined
        ? `${section.heading}  (${formatTimestamp(section.timestamp)})`
        : section.heading;
    heading(doc, fonts, title, 15);
    sectionBody(doc, fonts, section);
  });

  questions(doc, fonts, notes);

  if (notes.excluded?.length) {
    ensureSpace(doc, 40);
    doc.moveDown(0.6);
    writeRich(doc, fonts, `Excluded non-content segments: ${notes.excluded.join("; ")}.`, {
      width: CONTENT_WIDTH,
      size: 9,
      color: COLORS.muted,
      lineGap: 2,
    });
    doc.moveDown(0.4);
  }
  await slidesGallery(doc, fonts, slides);
  if (options.includeTranscript) transcriptAppendix(doc, fonts, transcript);

  addFooters(doc, fonts, options.coverTitle?.trim() || meta.title);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}
