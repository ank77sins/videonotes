"use client";

import { useRef, useState } from "react";
import { Loader2, Link2, FileText, Upload, Download } from "lucide-react";
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
  const [loadedVideo, setLoadedVideo] = useState<LoadedVideo | null>(null);
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
      const video = {
        meta: data.meta!,
        segments: data.segments,
        text: data.text ?? "",
        source: data.source ?? "unknown",
        cookies: cookies.trim() || undefined,
      };
      setLoadedVideo(video);
      onLoaded(video);
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
    // If it's a .txt file, parse it as transcript
    if (file.name.endsWith('.txt')) {
      const lines = text.split('\n').filter(line => line.trim());
      const segments: TranscriptSegment[] = [];
      let time = 0;
      for (const line of lines) {
        // Try to extract timestamp [MM:SS] or [HH:MM:SS]
        const timeMatch = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
        if (timeMatch) {
          const hours = timeMatch[3] ? parseInt(timeMatch[1]) : 0;
          const minutes = timeMatch[3] ? parseInt(timeMatch[2]) : parseInt(timeMatch[1]);
          const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : parseInt(timeMatch[2]);
          time = hours * 3600 + minutes * 60 + seconds;
          const content = line.replace(/\[.*?\]\s*/, '').trim();
          if (content) {
            segments.push({ start: time, text: content });
          }
        } else {
          // No timestamp, use incremental time
          segments.push({ start: time, text: line.trim() });
          time += 5; // Assume 5 seconds per line
        }
      }
      if (segments.length > 0) {
        const video: LoadedVideo = {
          meta: {
            title: file.name.replace('.txt', ''),
            channel: 'Uploaded Transcript',
            url: '',
            thumbnail: '',
            durationSeconds: time,
          },
          segments,
          text,
          source: 'txt-file',
        };
        setLoadedVideo(video);
        onLoaded(video);
        toast.success("Transcript file loaded");
      }
    }
  };

  const downloadTranscript = () => {
    if (!loadedVideo) return;
    const safeTitle = loadedVideo.meta.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const transcriptText = loadedVideo.segments
      .map(s => `[${formatTimestamp(s.start)}] ${s.text}`)
      .join('\n');
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${safeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transcript downloaded as .txt file");
  };

  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
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
              Upload .srt / .vtt / .txt
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

      {loadedVideo && (
        <div className="rounded-lg border border-green-300/60 bg-green-50 p-4 space-y-3 dark:border-green-500/30 dark:bg-green-500/10">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-200">Transcript Loaded</p>
              <p className="text-xs text-green-800/80 dark:text-green-200/80">
                {loadedVideo.segments.length} segments · {loadedVideo.meta.title}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadTranscript}
            className="gap-2"
          >
            <Download className="size-4" />
            Download as .txt file
          </Button>
          <p className="text-xs text-green-800/80 dark:text-green-200/80">
            Save this file to retry AI generation later without re-downloading the video.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-blue-300/60 bg-blue-50 p-4 space-y-3 dark:border-blue-500/30 dark:bg-blue-500/10">
        <div className="flex items-center gap-2">
          <Upload className="size-5 text-blue-600" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-200">Upload Existing Transcript</p>
            <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
              Skip video download. Use a previously saved .txt file for AI processing.
            </p>
          </div>
        </div>
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="gap-2"
        >
          <Upload className="size-4" />
          Upload .txt / .srt / .vtt file
        </Button>
        {fileName && (
          <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
            Selected: {fileName}
          </p>
        )}
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
