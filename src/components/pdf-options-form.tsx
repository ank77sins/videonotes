"use client";

import { useState } from "react";
import { ArrowLeft, FileDown, Loader2, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_OPTIONS, type PdfOptions, type VideoMeta } from "@/lib/types";
import type { LoadedVideo } from "./url-form";
import { VideoDownloadControl } from "./video-download";

const fieldClass = "space-y-2";

export function PdfOptionsForm({
  video,
  aiEnabled,
  generating,
  onBack,
  onGenerate,
  onOpenSettings,
}: {
  video: LoadedVideo;
  aiEnabled: boolean;
  generating: boolean;
  onBack: () => void;
  onGenerate: (options: PdfOptions) => void;
  onOpenSettings: () => void;
}) {
  const [options, setOptions] = useState<PdfOptions>({
    ...DEFAULT_OPTIONS,
    coverTitle: video.meta.title,
  });

  const set = <K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const meta: VideoMeta = video.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={meta.thumbnail}
          alt=""
          className="h-16 w-28 flex-none rounded-md object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{meta.title}</p>
          <p className="truncate text-sm text-muted-foreground">{meta.channel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Transcript source: {video.source} · {video.segments.length} segments
          </p>
        </div>
      </div>

      {!aiEnabled ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <Info className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Basic mode</p>
            <p className="text-muted-foreground">
              Without an AI key you get extractive notes and OCR slide text. Add a free key for
              real summaries and slide descriptions.
            </p>
            <Button variant="link" className="h-auto p-0" onClick={onOpenSettings} type="button">
              Add an API key
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldClass}>
          <Label htmlFor="audience">Audience</Label>
          <Input
            id="audience"
            value={options.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="e.g. Beginner students"
          />
        </div>

        <div className={fieldClass}>
          <Label htmlFor="language">Language</Label>
          <Input
            id="language"
            value={options.language}
            onChange={(e) => set("language", e.target.value)}
            placeholder="e.g. English"
          />
        </div>

        <div className={fieldClass}>
          <Label htmlFor="depth">Depth</Label>
          <Select value={options.depth} onValueChange={(v) => set("depth", v as PdfOptions["depth"])}>
            <SelectTrigger id="depth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brief">Brief</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="detailed">Detailed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={fieldClass}>
          <Label htmlFor="tone">Tone</Label>
          <Select value={options.tone} onValueChange={(v) => set("tone", v as PdfOptions["tone"])}>
            <SelectTrigger id="tone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="academic">Academic</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={fieldClass}>
          <Label htmlFor="style">Format</Label>
          <Select value={options.style} onValueChange={(v) => set("style", v as PdfOptions["style"])}>
            <SelectTrigger id="style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="notes">Lecture notes</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="study-guide">Study guide</SelectItem>
              <SelectItem value="qa">Q&amp;A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={fieldClass}>
          <Label htmlFor="coverTitle">Cover title</Label>
          <Input
            id="coverTitle"
            value={options.coverTitle}
            onChange={(e) => set("coverTitle", e.target.value)}
            placeholder={meta.title}
          />
        </div>

        <div className={fieldClass}>
          <Label htmlFor="author">Prepared by (optional)</Label>
          <Input
            id="author"
            value={options.author}
            onChange={(e) => set("author", e.target.value)}
            placeholder="Your name"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={options.includeSlides}
            onCheckedChange={(v) => set("includeSlides", v === true)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">Slides &amp; visuals</span>
            <span className="block text-xs text-muted-foreground">
              Capture frames and describe them. Much slower — downloads the video.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={options.includeTimestamps}
            onCheckedChange={(v) => set("includeTimestamps", v === true)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">Timestamps</span>
            <span className="block text-xs text-muted-foreground">Link sections to the video.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={options.includeTranscript}
            onCheckedChange={(v) => set("includeTranscript", v === true)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">Full transcript</span>
            <span className="block text-xs text-muted-foreground">Append the full text.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Also want the video file?</p>
          <p className="text-xs text-muted-foreground">
            Download the MP4 separately. Preparing it can take a minute.
          </p>
        </div>
        <VideoDownloadControl
          url={meta.url}
          title={meta.title}
          cookies={video.cookies}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack} disabled={generating} type="button" className="gap-2">
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <Button onClick={() => onGenerate(options)} disabled={generating} className="gap-2">
          {generating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileDown className="size-4" aria-hidden />
          )}
          {generating ? "Starting…" : "Generate PDF"}
        </Button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden />
        {aiEnabled ? "AI summaries enabled" : "Basic extractive mode"} · language {options.language || "—"}
      </p>
    </div>
  );
}
