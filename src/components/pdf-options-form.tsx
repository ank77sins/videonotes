"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, FileDown, Loader2, Sparkles, Info, Brain, Layers, FileText, Clock, AlertTriangle } from "lucide-react";
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
    audience: "", 
    language: "English",
    depth: "detailed",
    tone: "academic",
    style: "study-guide", 
    includeSlides: true, // Default
  });

  // Wizard specific states
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [mergeRepetitions, setMergeRepetitions] = useState(true);
  const [excludeFluff, setExcludeFluff] = useState(true);

  // 🚨 CRASH PREVENTION SAFETY SWITCH 🚨
  // If video is longer than 2 hours (7200 seconds), auto-disable slides to prevent RAM crash
  const isLongVideo = (video.meta.durationSeconds ?? 0) > 7200;
  
  useEffect(() => {
    if (isLongVideo && options.includeSlides) {
      setOptions(prev => ({ ...prev, includeSlides: false }));
    }
  }, [isLongVideo]);

  const set = <K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const meta: VideoMeta = video.meta;
  const isFormValid = subject.trim() !== "" && level.trim() !== "" && outputFormat.trim() !== "";

  const handleGenerate = () => {
    const wizardData = `SUBJECT: ${subject} | LEVEL: ${level} | FORMAT: ${outputFormat} | RULES: ${mergeRepetitions ? 'Merge Repetitions' : ''}, ${excludeFluff ? 'Exclude Fluff' : ''}`;
    onGenerate({
        ...options,
        audience: wizardData, 
        style: outputFormat === "cheatsheet" ? "study-guide" : options.style
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={meta.thumbnail} alt="" className="h-16 w-28 flex-none rounded-md object-cover" />
        <div className="min-w-0">
          <p className="truncate font-medium">{meta.title}</p>
          <p className="truncate text-sm text-muted-foreground">{meta.channel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Transcript source: {video.source} · {video.segments.length} segments
          </p>
        </div>
      </div>

      {/* LONG VIDEO WARNING */}
      {isLongVideo && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/50 dark:bg-red-900/20 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-5 flex-none" />
          <div>
            <p className="font-bold">⚠️ 36-Hour Video Detected (Crash Prevention Active)</p>
            <p className="mt-1">Extracting slides for videos over 2 hours consumes massive amounts of RAM and will crash your computer. Slides extraction has been automatically disabled to save your PDF generation. Pure transcript processing is safe!</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            Step 1: Context & Subject
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
            <div className={fieldClass}>
                <Label htmlFor="subject">Specific Subject / Topic *</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Modern Indian History" />
            </div>
            <div className={fieldClass}>
                <Label htmlFor="level">Target Level *</Label>
                <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger id="level"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="high-school">High School</SelectItem>
                        <SelectItem value="college-exam">College / Competitive Exam</SelectItem>
                        <SelectItem value="university">University / Degree</SelectItem>
                        <SelectItem value="expert">Expert / Professional</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
      </div>

      <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
            <Layers className="size-5 text-primary" />
            Step 2: Output Format *
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'cheatsheet' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'cheatsheet'} onChange={() => setOutputFormat('cheatsheet')} className="sr-only" />
                <div className="mt-1"><FileText className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">⚡ Ultra-Dense Cheatsheet</span>
                    <span className="block text-xs text-muted-foreground">Tables, key-value pairs. 1 line replaces 6-7 transcript lines.</span>
                </span>
            </label>
            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'flashcards' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'flashcards'} onChange={() => setOutputFormat('flashcards')} className="sr-only" />
                <div className="mt-1"><Layers className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">🧠 Flashcards</span>
                    <span className="block text-xs text-muted-foreground">Q&A format ready for Anki or Quizlet.</span>
                </span>
            </label>
            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'summary' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'summary'} onChange={() => setOutputFormat('summary')} className="sr-only" />
                <div className="mt-1"><FileText className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">📖 Detailed Summary</span>
                    <span className="block text-xs text-muted-foreground">Structured paragraphs with headings.</span>
                </span>
            </label>
            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'slides' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'slides'} onChange={() => setOutputFormat('slides')} className="sr-only" />
                <div className="mt-1"><Clock className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">⏱️ Timestamped Deck</span>
                    <span className="block text-xs text-muted-foreground">Slide-by-slide notes with timestamps.</span>
                </span>
            </label>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="text-lg font-bold">Step 3: Strict Processing Rules</h3>
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox checked={mergeRepetitions} onCheckedChange={(v) => setMergeRepetitions(v === true)} />
                <span className="space-y-1">
                    <span className="block text-sm font-medium">Merge Repetitions with ⭐</span>
                    <span className="block text-xs text-muted-foreground">Compile repeated concepts and mark as high priority.</span>
                </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox checked={excludeFluff} onCheckedChange={(v) => setExcludeFluff(v === true)} />
                <span className="space-y-1">
                    <span className="block text-sm font-medium">Exclude Conversational Fluff</span>
                    <span className="block text-xs text-muted-foreground">Remove intros, outros, and sponsor segments.</span>
                </span>
            </label>
        </div>
      </div>

      <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
             Advanced Settings & Visuals
          </summary>
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
             <label className="flex items-start gap-3 rounded-lg border p-3 sm:col-span-2">
                <Checkbox
                    checked={options.includeSlides}
                    onCheckedChange={(v) => set("includeSlides", v === true)}
                    disabled={isLongVideo}
                />
                <span className="space-y-1">
                    <span className="block text-sm font-medium">Capture Slides & Visuals</span>
                    <span className="block text-xs text-muted-foreground">
                        {isLongVideo ? "⚠️ Disabled for videos > 2 hours to prevent RAM crash." : "Downloads video to capture frames. Slower."}
                    </span>
                </span>
            </label>
            <div className={fieldClass}>
                <Label htmlFor="language">Language</Label>
                <Input id="language" value={options.language} onChange={(e) => set("language", e.target.value)} />
            </div>
            <div className={fieldClass}>
                <Label htmlFor="coverTitle">Cover title</Label>
                <Input id="coverTitle" value={options.coverTitle} onChange={(e) => set("coverTitle", e.target.value)} />
            </div>
          </div>
      </details>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onBack} disabled={generating} type="button" className="gap-2">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Button>
        {!isFormValid && <p className="text-xs text-destructive flex items-center self-center sm:mr-auto">* Please complete Step 1 and Step 2</p>}
        <Button onClick={handleGenerate} disabled={generating || !isFormValid} className="gap-2">
          {generating ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          {generating ? "Starting…" : "Generate Cheatsheet PDF"}
        </Button>
      </div>
    </div>
  );
}
