import type { RegisteredFonts } from "./fonts";
import { fontNameFor, splitRuns, visualOrder, detectScripts } from "./fonts";

export interface WriteOptions {
  width: number;
  size?: number;
  bold?: boolean;
  color?: string;
  x?: number;
  y?: number;
  lineGap?: number;
  align?: "left" | "center" | "right" | "justify";
}

function sanitize(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

export function writeText(
  doc: PDFKit.PDFDocument,
  fonts: RegisteredFonts,
  text: string,
  opts: WriteOptions,
): void {
  const clean = sanitize(text);
  if (!clean) return;

  const { rtl } = detectScripts(clean);
  const ordered = rtl ? visualOrder(clean) : clean;
  const runs = splitRuns(ordered);
  const size = opts.size ?? 10.5;

  const applyCommon = (font: string) => {
    doc.font(font).fontSize(size);
    if (opts.color) doc.fillColor(opts.color);
  };

  if (runs.length <= 1) {
    applyCommon(fontNameFor(runs[0]?.script ?? "base", Boolean(opts.bold), fonts));
    doc.text(clean, opts.x ?? doc.x, opts.y ?? doc.y, {
      width: opts.width,
      lineGap: opts.lineGap ?? 2,
      align: opts.align ?? "left",
    });
    return;
  }

  runs.forEach((run, index) => {
    applyCommon(fontNameFor(run.script, Boolean(opts.bold), fonts));
    const isFirst = index === 0;
    const isLast = index === runs.length - 1;
    const options: PDFKit.Mixins.TextOptions = {
      width: opts.width,
      lineGap: opts.lineGap ?? 2,
      align: opts.align ?? "left",
      continued: !isLast,
    };
    if (isFirst) {
      doc.text(run.text, opts.x ?? doc.x, opts.y ?? doc.y, options);
    } else {
      doc.text(run.text, options);
    }
  });
}
