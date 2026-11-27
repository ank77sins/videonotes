import { YoutubeTranscript } from "youtube-transcript";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TranscriptSegment } from "../types";
import { canonicalUrl } from "./url";
import { ytdlpRun } from "./ytdlp";

function timeToSeconds(t: string): number {
  const clean = t.trim().replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSubtitles(raw: string): TranscriptSegment[] {
  const content = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (/<transcript|<text|<p\s+t=/i.test(content)) {
    const segments: TranscriptSegment[] = [];
    const textRe = /<text[^>]*start="([\d.]+)"[^>]*(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
    let m: RegExpExecArray | null;
    while ((m = textRe.exec(content))) {
      const start = Number(m[1]);
      const dur = m[2] ? Number(m[2]) : 2;
      segments.push({ start, duration: dur, text: stripTags(m[3]) });
    }
    if (segments.length) return segments;

    const pRe = /<p[^>]*\bt="(\d+)"[^>]*(?:\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi;
    while ((m = pRe.exec(content))) {
      const start = Number(m[1]) / 1000;
      const dur = m[2] ? Number(m[2]) / 1000 : 2;
      segments.push({ start, duration: dur, text: stripTags(m[3]) });
    }
    return segments.filter((s) => s.text);
  }

  const segments: TranscriptSegment[] = [];
  const blocks = content.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() && !/^WEBVTT/i.test(l));
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;
    const [startRaw, endRaw] = lines[timingIdx].split("-->").map((s) => s.trim());
    const start = timeToSeconds(startRaw);
    const end = timeToSeconds(endRaw?.split(/\s+/)[0] ?? startRaw);
    const text = stripTags(lines.slice(timingIdx + 1).join(" "));
    if (text) segments.push({ start, duration: Math.max(0.5, end - start), text });
  }
  return segments;
}

export function segmentsToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let prev = "";
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text || text === prev) continue;
    out.push({ ...seg, text });
    prev = text;
  }
  return out;
}

async function fromYoutubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  const langs: (string | undefined)[] = ["en", "en-US", "en-GB", undefined];
  let lastErr: unknown;
  for (const lang of langs) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      if (items?.length) {
        return items.map((i) => ({
          start: i.offset / 1000,
          duration: i.duration / 1000,
          text: i.text.replace(/\s+/g, " ").trim(),
        }));
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function fromYtdlp(videoId: string, cookiesPath?: string): Promise<TranscriptSegment[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytsub-"));
  try {
    await ytdlpRun(
      canonicalUrl(videoId),
      {
        skipDownload: true,
        writeSubs: true,
        writeAutoSubs: true,
        subLangs: "en.*,en",
        subFormat: "vtt/srt/best",
        output: path.join(dir, "%(id)s.%(ext)s"),
        ...(cookiesPath ? { cookies: cookiesPath } : {}),
      },
      60000,
    );
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(vtt|srt)$/i.test(f))
      .sort((a, b) => (a.includes("en") ? -1 : 1));
    if (!files.length) return [];
    const raw = fs.readFileSync(path.join(dir, files[0]), "utf8");
    return parseSubtitles(raw);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function fetchTranscript(
  videoId: string,
  cookiesPath?: string,
): Promise<{ segments: TranscriptSegment[]; source: "youtube" | "ytdlp" | "none" }> {
  try {
    const segs = dedupeSegments(await fromYoutubeTranscript(videoId));
    if (segs.length) return { segments: segs, source: "youtube" };
  } catch {
    // fall through
  }
  try {
    const segs = dedupeSegments(await fromYtdlp(videoId, cookiesPath));
    if (segs.length) return { segments: segs, source: "ytdlp" };
  } catch {
    // fall through
  }
  return { segments: [], source: "none" };
}
