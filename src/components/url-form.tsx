"use client";

import { useRef, useState } from "react";
import { Loader2, Link2, FileText, Upload, Download, FolderOpen, Trash2 } from "lucide-react";
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
  tempFilePath?: string;
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
  tempFilePath?: string;
}

export function UrlForm({ onLoaded }: { onLoaded: (v: LoadedVideo) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTranscript, setNeedsTranscript] = useState<{ meta?: VideoMeta; reason?: string } | null>(null);
  const [manual, setManual] = useState("");
  const [cookies, setCookies] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadedVideo, setLoadedVideo] = useState<LoadedVideo | null>(null);
  const [tempFilePath, setTempFilePath] = useState<string | null>(null);
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
      const video: LoadedVideo = {
        meta: data.meta!,
        segments: data.segments,
        text: data.text ?? "",
        source: data.source ?? "unknown",
        cookies: cookies.trim() || undefined,
        tempFilePath: data.tempFilePath,
      };
      setLoadedVideo(video);
      if (data.tempFilePath) setTempFilePath(data.tempFilePath);
      onLoaded(video);
      toast.success("Transcript loaded");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const text = await file.text();
      setFileName(file.name);

      let segments: TranscriptSegment[] = [];
      let totalSeconds = 0;

      if (file.name.endsWith('.txt')) {
        const lines = text.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const timeMatch = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
          if (timeMatch) {
            const hours = timeMatch[3] ? parseInt(timeMatch[1]) : 0;
            const minutes = timeMatch[3] ? parseInt(timeMatch[2]) : parseInt(timeMatch[1]);
            const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : parseInt(timeMatch[2]);
            totalSeconds = hours * 3600 + minutes * 60 + seconds;
            const content = line.replace(/\[.*?\]\s*/, '').trim();
            if (content) {
              segments.push({ start: totalSeconds, text: content });
            }
          } else if (line.trim()) {
            segments.push({ start: totalSeconds, text: line.trim() });
            totalSeconds += 5;
          }
        }
      } else if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
        const blocks = text.split(/\n\n+/);
        for (const block of blocks) {
          const timeMatch = block.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
          if (timeMatch) {
            const startSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
            const content = block.split('\n').slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
            if (content) segments.push({ start: startSec, text: content });
          }
        }
      }

      if (segments.length === 0) {
        setError("Could not parse transcript from this file. Use format: [MM:SS] text");
        return;
      }

      const video: LoadedVideo = {
        meta: {
          title: file.name.replace(/\.(txt|srt|vtt)$/i, ''),
          channel: 'Uploaded File',
          url: '',
          thumbnail: '',
          durationSeconds: totalSeconds,
        },
        segments,
        text,
        source: 'uploaded-file',
      };
      setLoadedVideo(video);
      onLoaded(video);
      toast.success(`Loaded ${segments.length} segments from ${file.name}`);
    } catch (err) {
      setError("Failed to read file: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTranscript = () => {
    if (!loadedVideo) return;
    const safeTitle = loadedVideo.meta.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const transcriptText = loadedVideo.segments
      .map(s => `[${formatTimestamp(s.start)}] ${s.text}`)
      .join('\n');
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = `transcript_${safeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(urlObj);
    toast.success("Transcript downloaded");
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
            {needsTranscript.reason ?? "Paste the transcript, upload a subtitle file, or add cookies to continue."}
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
                if (file) void handleFileUpload(file);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} type="button">
              <Upload className="size-4" aria-hidden />
              Upload .srt / .vtt / .txt
            </Button>
            {fileName ? <span className="truncate text-xs text-muted-foreground">{fileName}</span> : null}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => submit(manual)} disabled={loading || !manual.trim()} className="gap-2">
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
    <div className="space-y-4">
      {/* YouTube URL Input */}
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
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
      </form>

      {/* Upload Transcript File Section */}
      <div className="rounded-lg border-2 border-dashed border-blue-300/60 bg-blue-50/50 p-4 space-y-3 dark:border-blue-500/30 dark:bg-blue-500/10">
        <div className="flex items-center gap-2">
          <Upload className="size-5 text-blue-600" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-200">Option 2: Upload Existing Transcript</p>
            <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
              Skip video download. Use a previously saved .txt, .srt, or .vtt file.
            </p>
          </div>
        </div>
        <input
          type="file"
          accept=".srt,.vtt,.txt"
          className="sr-only"
          id="transcript-upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileUpload(file);
          }}
        />
        <label htmlFor="transcript-upload">
          <Button type="button" variant="outline" size="sm" asChild className="gap-2 cursor-pointer">
            <span>
              <Upload className="size-4" />
              Choose .txt / .srt / .vtt file
            </span>
          </Button>
        </label>
        {fileName && (
          <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
            Selected: <span className="font-medium">{fileName}</span>
          </p>
        )}
      </div>

      {/* Loaded Transcript Info */}
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

          {tempFilePath && (
            <div className="rounded bg-white/60 dark:bg-black/20 p-2 space-y-1">
              <div className="flex items-center gap-1.5 text-xs">
                <FolderOpen className="size-3.5 text-green-700" />
                <span className="font-medium text-green-900 dark:text-green-200">Saved on server at:</span>
              </div>
              <code className="block text-xs text-green-800 dark:text-green-300 break-all font-mono bg-white/80 dark:bg-black/40 px-2 py-1 rounded">
                {tempFilePath}
              </code>
              <p className="text-xs text-green-800/80 dark:text-green-200/80">
                This file will be automatically deleted after successful PDF generation. If AI fails, it stays here for retry.
              </p>
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={downloadTranscript} className="gap-2">
            <Download className="size-4" />
            Download .txt copy to your computer
          </Button>
        </div>
      )}

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
    </div>
  );
}
