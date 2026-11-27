import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { FRAME_DIR, deleteJobRow, getJobRow } from "@/lib/db";
import type { JobView } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toView(row: ReturnType<typeof getJobRow>): JobView | null {
  if (!row) return null;
  return {
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
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = toView(getJobRow(id));
  if (!view) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  return NextResponse.json({ ok: true, job: view });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = getJobRow(id);
  if (!row) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  if (row.pdfPath) {
    try {
      fs.rmSync(row.pdfPath, { force: true });
    } catch {
      // ignore
    }
  }
  try {
    fs.rmSync(path.join(FRAME_DIR, id), { recursive: true, force: true });
  } catch {
    // ignore
  }
  deleteJobRow(id);
  return NextResponse.json({ ok: true });
}
