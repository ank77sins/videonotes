import PDFDocument from "pdfkit";
import fs from "node:fs";
import sharp from "sharp";
import type {
  NotesDocument,
  PdfOptions,
  SlideItem,
  TranscriptSegment,
  VideoMeta,
} from "../types";
import { formatTimestamp } from "../youtube/url";

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

function heading(doc: PDFKit.PDFDocument, text: string, size = 18): void {
  ensureSpace(doc, 48);
  doc.moveDown(0.6);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(size).text(text, { width: CONTENT_WIDTH });
  doc.moveDown(0.35);
  doc
    .strokeColor(COLORS.rule)
    .lineWidth(1)
    .moveTo(PAGE.margin, doc.y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

function bullet(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 24);
  const y = doc.y;
  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(10).text("•", PAGE.margin, y, {
    width: 14,
    continued: false,
  });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(10.5)
    .text(text, PAGE.margin + 16, y, { width: CONTENT_WIDTH - 16, lineGap: 2 });
  doc.moveDown(0.25);
}

function cover(doc: PDFKit.PDFDocument, input: RenderInput): void {
  const { meta, options } = input;
  const w = doc.page.width;
  const h = doc.page.height;
  doc.rect(0, 0, w, h).fill(COLORS.cover);
  doc.rect(0, h - 8, w, 8).fill(COLORS.accent);

  const title = options.coverTitle?.trim() || meta.title;
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text(title, PAGE.margin, 150, { width: w - PAGE.margin * 2, lineGap: 4 });

  doc.moveDown(0.6);
  doc.fillColor(COLORS.coverAccent).font("Helvetica").fontSize(13).text(meta.channel);
  if (meta.durationSeconds) {
    doc.fontSize(11).fillColor("#cbd5e1").text(`Duration ${formatTimestamp(meta.durationSeconds)}`);
  }

  doc
    .fillColor("#e5e7eb")
    .font("Helvetica")
    .fontSize(11)
    .text(
      `${input.usedAi ? "AI-generated" : "Basic (offline)"} study notes  •  ${input.options.language}  •  ${input.options.style.replace("-", " ")}`,
      PAGE.margin,
      h - 150,
      { width: w - PAGE.margin * 2 },
    );

  if (options.author?.trim()) {
    doc.fillColor("#9ca3af").fontSize(10).text(`Prepared by ${options.author}`, PAGE.margin, h - 120, {
      width: w - PAGE.margin * 2,
    });
  }
  doc.fillColor("#6b7280").fontSize(9).text(meta.url, PAGE.margin, h - 100, {
    width: w - PAGE.margin * 2,
  });
  doc.addPage();
}

function contents(doc: PDFKit.PDFDocument, notes: NotesDocument): void {
  heading(doc, "Contents", 20);
  notes.sections.forEach((s, i) => {
    const label = s.timestamp !== undefined ? `${formatTimestamp(s.timestamp)}  ·  ${s.heading}` : s.heading;
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(11).text(`${i + 1}.  ${label}`, {
      width: CONTENT_WIDTH,
    });
    doc.moveDown(0.15);
  });
}

async function slidesGallery(doc: PDFKit.PDFDocument, slides: SlideItem[]): Promise<void> {
  if (!slides.length) return;
  doc.addPage();
  heading(doc, "Slides & Visuals", 20);
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
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(label, PAGE.margin, doc.y);
      doc.moveDown(0.2);

      const caption = slide.caption || slide.ocrText;
      if (caption) {
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(10).text(caption, {
          width: CONTENT_WIDTH,
          lineGap: 2,
        });
      }
      doc.moveDown(0.8);
    } catch {
      // skip broken image
    }
  }
}

function questions(doc: PDFKit.PDFDocument, notes: NotesDocument): void {
  if (!notes.questions?.length) return;
  heading(doc, "Review Questions", 18);
  notes.questions.forEach((qa, i) => {
    ensureSpace(doc, 40);
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`Q${i + 1}. ${qa.q}`, { width: CONTENT_WIDTH });
    doc.moveDown(0.15);
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(`A. ${qa.a}`, {
      width: CONTENT_WIDTH,
      lineGap: 2,
    });
    doc.moveDown(0.6);
  });
}

function transcriptAppendix(doc: PDFKit.PDFDocument, segments: TranscriptSegment[]): void {
  if (!segments.length) return;
  doc.addPage();
  heading(doc, "Full Transcript", 20);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9.5);
  for (const seg of segments) {
    ensureSpace(doc, 20);
    const y = doc.y;
    doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(8.5).text(formatTimestamp(seg.start), PAGE.margin, y, {
      width: 42,
    });
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(9.5)
      .text(seg.text, PAGE.margin + 46, y, { width: CONTENT_WIDTH - 46, lineGap: 1.5 });
    doc.moveDown(0.15);
  }
}

function addFooters(doc: PDFKit.PDFDocument, title: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === range.start) continue;
    const prevBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
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

  const stream = fs.createWriteStream(input.outPath);
  doc.pipe(stream);

  cover(doc, input);
  contents(doc, notes);

  doc.addPage();
  heading(doc, options.coverTitle?.trim() || meta.title, 20);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(`${meta.channel}  ·  ${meta.url}`);
  doc.moveDown(0.4);

  if (notes.summary) {
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(11).text(notes.summary, {
      width: CONTENT_WIDTH,
      lineGap: 3,
    });
    doc.moveDown(0.6);
  }

  if (notes.keyTakeaways.length) {
    heading(doc, "Key Takeaways", 15);
    notes.keyTakeaways.forEach((t) => bullet(doc, t));
    doc.moveDown(0.4);
  }

  notes.sections.forEach((section) => {
    const title =
      options.includeTimestamps && section.timestamp !== undefined
        ? `${section.heading}  (${formatTimestamp(section.timestamp)})`
        : section.heading;
    heading(doc, title, 15);
    section.bullets.forEach((b) => bullet(doc, b));
  });

  questions(doc, notes);
  await slidesGallery(doc, slides);
  if (options.includeTranscript) transcriptAppendix(doc, transcript);

  addFooters(doc, options.coverTitle?.trim() || meta.title);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}
