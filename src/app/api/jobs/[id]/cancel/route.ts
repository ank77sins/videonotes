import { NextResponse } from "next/server";
import { getJobRow } from "@/lib/db";
import { cancelJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = getJobRow(id);
  if (!row) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  if (row.status === "done" || row.status === "error" || row.status === "cancelled") {
    return NextResponse.json({ ok: true, status: row.status });
  }
  cancelJob(id);
  return NextResponse.json({ ok: true });
}
