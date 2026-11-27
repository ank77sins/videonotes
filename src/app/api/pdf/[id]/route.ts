import { getJobRow } from "@/lib/db";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "video-notes";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = getJobRow(id);
  if (!row || !row.pdfPath || !fs.existsSync(row.pdfPath)) {
    return new Response("PDF not found", { status: 404 });
  }

  const data = fs.readFileSync(row.pdfPath);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const filename = `${slugify(row.title ?? "video-notes")}.pdf`;

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
