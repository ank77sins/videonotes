"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_QUALITIES, type VideoQuality } from "@/lib/video-quality";

function triggerBrowserDownload(id: string) {
  const a = document.createElement("a");
  a.href = `/api/video-download/${id}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function VideoDownloadControl({
  url,
  title,
  cookies,
  compact = false,
}: {
  url: string;
  title?: string;
  cookies?: string;
  compact?: boolean;
}) {
  const [quality, setQuality] = useState<VideoQuality>("720p");
  const [loading, setLoading] = useState(false);

  const prepare = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/video-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, quality, title, cookies }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Could not prepare the video download.");
        return;
      }
      triggerBrowserDownload(data.id as string);
      toast.success("Download started");
    } catch {
      toast.error("Network error while preparing the download.");
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <Button variant="outline" onClick={() => void prepare()} disabled={loading} className="gap-2">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        {loading ? "Preparing video…" : "Download video"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={quality} onValueChange={(v) => setQuality(v as VideoQuality)}>
        <SelectTrigger className="sm:w-48" aria-label="Video quality">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIDEO_QUALITIES.map((q) => (
            <SelectItem key={q.value} value={q.value}>
              {q.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={() => void prepare()} disabled={loading} className="gap-2">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        {loading ? "Preparing video…" : "Download MP4"}
      </Button>
    </div>
  );
}
