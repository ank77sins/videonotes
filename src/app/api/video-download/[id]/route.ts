import fs from "node:fs";
import { Readable } from "node:stream";
import { getVideoTicket } from "@/lib/youtube/video-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ticket = getVideoTicket(id);
  if (!ticket || !fs.existsSync(ticket.path)) {
    return new Response("Download not found or expired. Please prepare it again.", { status: 404 });
  }

  const stat = fs.statSync(ticket.path);
  const stream = Readable.toWeb(fs.createReadStream(ticket.path)) as ReadableStream;

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": ticket.mime,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${ticket.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
