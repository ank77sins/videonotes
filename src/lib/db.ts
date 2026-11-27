import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { JobRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const PDF_DIR = path.join(DATA_DIR, "pdfs");
export const FRAME_DIR = path.join(DATA_DIR, "frames");

for (const dir of [DATA_DIR, PDF_DIR, FRAME_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __ytpdfDb?: DB };

function createDb(): DB {
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      video_id TEXT,
      title TEXT,
      channel TEXT,
      thumbnail TEXT,
      duration INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',
      step TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      options TEXT,
      error TEXT,
      pdf_path TEXT,
      slides_count INTEGER NOT NULL DEFAULT 0,
      provider TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
  `);
  return db;
}

export const db: DB = globalForDb.__ytpdfDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__ytpdfDb = db;

const insertStmt = db.prepare(`
  INSERT INTO jobs (id, url, video_id, title, channel, thumbnail, duration, status, step, progress, message, options, error, pdf_path, slides_count, provider, created_at, updated_at)
  VALUES (@id, @url, @video_id, @title, @channel, @thumbnail, @duration, @status, @step, @progress, @message, @options, @error, @pdf_path, @slides_count, @provider, @created_at, @updated_at)
`);

export function insertJob(job: JobRecord): void {
  insertStmt.run({
    id: job.id,
    url: job.url,
    video_id: job.videoId,
    title: job.title,
    channel: job.channel,
    thumbnail: job.thumbnail,
    duration: job.duration,
    status: job.status,
    step: job.step,
    progress: job.progress,
    message: job.message,
    options: job.options,
    error: job.error,
    pdf_path: job.pdfPath,
    slides_count: job.slidesCount,
    provider: job.provider,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  });
}

const updateStmt = db.prepare(`
  UPDATE jobs SET
    status = COALESCE(@status, status),
    step = COALESCE(@step, step),
    progress = COALESCE(@progress, progress),
    message = @message,
    error = @error,
    pdf_path = COALESCE(@pdf_path, pdf_path),
    slides_count = COALESCE(@slides_count, slides_count),
    title = COALESCE(@title, title),
    channel = COALESCE(@channel, channel),
    thumbnail = COALESCE(@thumbnail, thumbnail),
    duration = COALESCE(@duration, duration),
    updated_at = @updated_at
  WHERE id = @id
`);

export function updateJob(
  id: string,
  patch: Partial<
    Pick<
      JobRecord,
      | "status"
      | "step"
      | "progress"
      | "message"
      | "error"
      | "pdfPath"
      | "slidesCount"
      | "title"
      | "channel"
      | "thumbnail"
      | "duration"
    >
  >,
): void {
  updateStmt.run({
    id,
    status: patch.status ?? null,
    step: patch.step ?? null,
    progress: patch.progress ?? null,
    message: patch.message ?? null,
    error: patch.error ?? null,
    pdf_path: patch.pdfPath ?? null,
    slides_count: patch.slidesCount ?? null,
    title: patch.title ?? null,
    channel: patch.channel ?? null,
    thumbnail: patch.thumbnail ?? null,
    duration: patch.duration ?? null,
    updated_at: Date.now(),
  });
}

export function getJobRow(id: string): JobRecord | undefined {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id as string,
    url: row.url as string,
    videoId: (row.video_id as string) ?? null,
    title: (row.title as string) ?? null,
    channel: (row.channel as string) ?? null,
    thumbnail: (row.thumbnail as string) ?? null,
    duration: (row.duration as number) ?? null,
    status: row.status as JobRecord["status"],
    step: (row.step as string) ?? null,
    progress: (row.progress as number) ?? 0,
    message: (row.message as string) ?? null,
    options: (row.options as string) ?? null,
    error: (row.error as string) ?? null,
    pdfPath: (row.pdf_path as string) ?? null,
    slidesCount: (row.slides_count as number) ?? 0,
    provider: (row.provider as string) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function listJobs(limit = 50): JobRecord[] {
  const rows = db
    .prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    url: row.url as string,
    videoId: (row.video_id as string) ?? null,
    title: (row.title as string) ?? null,
    channel: (row.channel as string) ?? null,
    thumbnail: (row.thumbnail as string) ?? null,
    duration: (row.duration as number) ?? null,
    status: row.status as JobRecord["status"],
    step: (row.step as string) ?? null,
    progress: (row.progress as number) ?? 0,
    message: (row.message as string) ?? null,
    options: (row.options as string) ?? null,
    error: (row.error as string) ?? null,
    pdfPath: (row.pdf_path as string) ?? null,
    slidesCount: (row.slides_count as number) ?? 0,
    provider: (row.provider as string) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }));
}

export function deleteJobRow(id: string): void {
  db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
}
