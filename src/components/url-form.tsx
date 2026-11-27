"use client";

import { useRef, useState } from "react";
import { Loader2, Link2, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { TranscriptSegment, VideoMeta } from "@/lib/types";

export interface LoadedVideo {
  meta: VideoMeta;
  segments: TranscriptSegment[];
  text: string;
  source: string;
  cookies?: string;
}

interface VideoResponse {
  ok: boolean;
  error?: string;
  reason?: string;
  meta?: VideoMeta;
  segments?: TranscriptSegment[];
  text?: string;
  source?: string;
  hasTranscript?: boolean;
}

export function UrlForm({ onLoaded }: { onLoaded: (v: LoadedVideo) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTranscript, setNeedsTranscript] = useState<{ meta?: VideoMeta; reason?: string } | null>(
    null,
  );
  const [manual, setManual] = useState("");
  const [cookies, setCookies] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (manualTranscript?: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, manualTranscript, cookies: cookies.trim() || undefined }),
      });
      const data = (await res.json()) as VideoResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load that video.");
        return;
      }
      if (!data.hasTranscript || !data.segments?.length) {
        setNeedsTranscript({ meta: data.meta, reason: data.reason });
        return;
      }
      onLoaded({
        meta: data.meta!,
        segments: data.segments,
        text: data.text ?? "",
        source: data.source ?? "unknown",
        cookies: cookies.trim() || undefined,
      });
      toast.success("Transcript loaded");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setManual(text);
    setFileName(file.name);
  };

  if (needsTranscript) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-medium">Automatic captions aren&apos;t available for this video.</p>
          <p className="mt-1 text-amber-800/80 dark:text-amber-200/80">
            {needsTranscript.reason ??
              "Paste the transcript, upload a subtitle file, or add cookies to continue."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual">Transcript</Label>
          <Textarea
            id="manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Paste the video transcript or subtitles here…"
            className="min-h-40 resize-y font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".srt,.vtt,.txt"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} type="button">
              <Upload className="size-4" aria-hidden />
              Upload .srt / .vtt
            </Button>
            {fileName ? <span className="truncate text-xs text-muted-foreground">{fileName}</span> : null}
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" type="button" className="px-0">
              YouTube cookies (optional)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder="Paste your exported YouTube cookies.txt content"
              className="min-h-24 resize-y font-mono text-xs"
            />
          </CollapsibleContent>
        </Collapsible>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => submit(manual)}
            disabled={loading || !manual.trim()}
            className="gap-2"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
            {loading ? "Reading transcript…" : "Use this transcript"}
          </Button>
          <Button variant="ghost" onClick={() => setNeedsTranscript(null)} disabled={loading} type="button">
            Use a different link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="url">YouTube link</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              className="pl-9"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading || !url.trim()} className="gap-2">
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {loading ? "Loading…" : "Load video"}
          </Button>
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button" className="px-0">
            Advanced: add YouTube cookies
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder="Paste exported cookies.txt to improve access when YouTube blocks the server"
            className="min-h-24 resize-y font-mono text-xs"
          />
        </CollapsibleContent>
      </Collapsible>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
