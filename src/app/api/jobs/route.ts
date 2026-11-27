import { NextResponse } from "next/server";
import fs from "node:fs";
import { listJobs } from "@/lib/db";
import type { JobView } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listJobs(50);
  const jobs: JobView[] = rows.map((row) => ({
    id: row.id,
    url: row.url,
    videoId: row.videoId,
    title: row.title,
    channel: row.channel,
    thumbnail: row.thumbnail,
    duration: row.duration,
    status: row.status,
    step: row.step,
    progress: row.progress,
    message: row.message,
    error: row.error,
    slidesCount: row.slidesCount,
    provider: row.provider,
    createdAt: row.createdAt,
    hasPdf: Boolean(row.pdfPath && fs.existsSync(row.pdfPath)),
  }));
  return NextResponse.json({ ok: true, jobs });
}
