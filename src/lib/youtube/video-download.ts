import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalUrl } from "./url";
import { ytdlpRun } from "./ytdlp";
import type { VideoQuality } from "../video-quality";

export type { VideoQuality } from "../video-quality";
export { VIDEO_QUALITIES } from "../video-quality";

const VIDEO_DIR = path.join(process.cwd(), "data", "videos");
const MAX_AGE_MS = 60 * 60 * 1000;

interface Ticket {
  path: string;
  filename: string;
  mime: string;
  createdAt: number;
}

const globalForTickets = globalThis as unknown as { __ytpdfVideoTickets?: Map<string, Ticket> };
const tickets: Map<string, Ticket> = globalForTickets.__ytpdfVideoTickets ?? new Map();
globalForTickets.__ytpdfVideoTickets = tickets;

function formatFor(quality: VideoQuality): string {
  if (quality === "best") {
    return "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b";
  }
  const h = quality.replace("p", "");
  return `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/b[height<=${h}][ext=mp4]/b[height<=${h}]/b`;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "video"
  );
}

function cleanupOld(): void {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (now - ticket.createdAt > MAX_AGE_MS) {
      try {
        fs.rmSync(ticket.path, { force: true });
      } catch {
        // ignore
      }
      tickets.delete(id);
    }
  }
}

export function getVideoTicket(id: string): Ticket | undefined {
  return tickets.get(id);
}

export async function prepareVideoDownload(input: {
  videoId: string;
  quality: VideoQuality;
  title?: string;
  cookiesPath?: string;
}): Promise<Ticket & { id: string; size: number }> {
  cleanupOld();
  if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const workDir = path.join(VIDEO_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    await ytdlpRun(
      canonicalUrl(input.videoId),
      {
        format: formatFor(input.quality),
        mergeOutputFormat: "mp4",
        output: path.join(workDir, "video.%(ext)s"),
        noWarnings: true,
        noPlaylist: true,
        ...(input.cookiesPath ? { cookies: input.cookiesPath } : {}),
      },
      900000,
    );

    const file = fs
      .readdirSync(workDir)
      .filter((f) => f.startsWith("video."))
      .find((f) => /\.(mp4|mkv|webm)$/i.test(f));
    if (!file) throw new Error("The video could not be downloaded.");

    const finalPath = path.join(VIDEO_DIR, `${id}.mp4`);
    fs.renameSync(path.join(workDir, file), finalPath);
    fs.rmSync(workDir, { recursive: true, force: true });

    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".webm" ? "video/webm" : ext === ".mkv" ? "video/x-matroska" : "video/mp4";
    const base = slugify(input.title ?? `youtube-${input.videoId}`);
    const ticket: Ticket = {
      path: finalPath,
      filename: `${base}-${input.quality}.mp4`,
      mime,
      createdAt: Date.now(),
    };
    tickets.set(id, ticket);
    return { id, ...ticket, size: fs.statSync(finalPath).size };
  } catch (err) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw err;
  }
}
