import { NextResponse } from "next/server";
import { listJobs } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = listJobs(1);
    return NextResponse.json({
      ok: true,
      status: "healthy",
      jobs: jobs.length,
      uptime: Math.round(process.uptime()),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: "unhealthy", error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
