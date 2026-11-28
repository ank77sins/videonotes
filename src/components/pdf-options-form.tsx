"use client";

import { useState } from "react";
import { ArrowLeft, FileDown, Loader2, Sparkles, Info, Brain, Layers, FileText, Clock } from "lucide-react";
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
  });

  // Wizard specific states
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [mergeRepetitions, setMergeRepetitions] = useState(true);
  const [excludeFluff, setExcludeFluff] = useState(true);

  const set = <K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const meta: VideoMeta = video.meta;

  // Disable generate button until required wizard steps are filled
  const isFormValid = subject.trim() !== "" && level.trim() !== "" && outputFormat.trim() !== "";

  const handleGenerate = () => {
    // We pack the wizard data into the 'audience' field so the backend AI can read it
    // without us having to rewrite your entire backend type system right now.
    const wizardData = `SUBJECT: ${subject} | LEVEL: ${level} | FORMAT: ${outputFormat} | RULES: ${mergeRepetitions ? 'Merge Repetitions' : ''}, ${excludeFluff ? 'Exclude Fluff' : ''}`;
    
    onGenerate({
        ...options,
        audience: wizardData, 
        style: outputFormat === "cheatsheet" ? "study-guide" : options.style
    });
  };

  return (
    <div className="space-y-6">
      {/* Video Thumbnail & Meta */}
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

      <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            Step 1: Context & Subject
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
            <div className={fieldClass}>
                <Label htmlFor="subject">Specific Subject / Topic *</Label>
                <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Modern Indian History, Biology 101, React.js"
                />
            </div>
            <div className={fieldClass}>
                <Label htmlFor="level">Target Level *</Label>
                <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger id="level">
                        <SelectValue placeholder="Select level" />
                    </SelectTrigger>
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
                    <span className="block text-xs text-muted-foreground">
                        Tables, key-value pairs. 1 line replaces 6-7 transcript lines. Best for exams.
                    </span>
                </span>
            </label>

            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'flashcards' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'flashcards'} onChange={() => setOutputFormat('flashcards')} className="sr-only" />
                <div className="mt-1"><Layers className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">🧠 Flashcards & Active Recall</span>
                    <span className="block text-xs text-muted-foreground">
                        Q&A format ready for Anki or Quizlet.
                    </span>
                </span>
            </label>

            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'summary' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'summary'} onChange={() => setOutputFormat('summary')} className="sr-only" />
                <div className="mt-1"><FileText className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">📖 Detailed Summary</span>
                    <span className="block text-xs text-muted-foreground">
                        Structured paragraphs with headings and bullet points.
                    </span>
                </span>
            </label>

            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${outputFormat === 'slides' ? 'border-primary bg-primary/10' : ''}`}>
                <input type="radio" name="format" checked={outputFormat === 'slides'} onChange={() => setOutputFormat('slides')} className="sr-only" />
                <div className="mt-1"><Clock className="size-4" /></div>
                <span className="space-y-1">
                    <span className="block text-sm font-medium">⏱️ Timestamped Slide Deck</span>
                    <span className="block text-xs text-muted-foreground">
                        Slide-by-slide notes with timestamps.
                    </span>
                </span>
            </label>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="text-lg font-bold">Step 3: Strict Processing Rules</h3>
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox
                    checked={mergeRepetitions}
                    onCheckedChange={(v) => setMergeRepetitions(v === true)}
                />
                <span className="space-y-1">
                    <span className="block text-sm font-medium">Merge Repetitions with ⭐</span>
                    <span className="block text-xs text-muted-foreground">
                        If a concept is repeated, compile it into one line and mark it as high priority.
                    </span>
                </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox
                    checked={excludeFluff}
                    onCheckedChange={(v) => setExcludeFluff(v === true)}
                />
                <span className="space-y-1">
                    <span className="block text-sm font-medium">Exclude Conversational Fluff</span>
                    <span className="block text-xs text-muted-foreground">
                        Remove "Welcome to the class", intros, and sponsor segments.
                    </span>
                </span>
            </label>
        </div>
      </div>

      {/* Advanced Options (Collapsed by default to keep UI clean) */}
      <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
             Advanced Settings (Language, Author, Cover Title)
          </summary>
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <div className={fieldClass}>
                <Label htmlFor="language">Language</Label>
                <Input id="language" value={options.language} onChange={(e) => set("language", e.target.value)} placeholder="e.g. English" />
            </div>
            <div className={fieldClass}>
                <Label htmlFor="coverTitle">Cover title</Label>
                <Input id="coverTitle" value={options.coverTitle} onChange={(e) => set("coverTitle", e.target.value)} placeholder={meta.title} />
            </div>
            <div className={fieldClass}>
                <Label htmlFor="author">Prepared by (optional)</Label>
                <Input id="author" value={options.author} onChange={(e) => set("author", e.target.value)} placeholder="Your name" />
            </div>
          </div>
      </details>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onBack} disabled={generating} type="button" className="gap-2">
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        
        {!isFormValid && (
            <p className="text-xs text-destructive flex items-center self-center sm:mr-auto">
                * Please complete Step 1 and Step 2 to generate.
            </p>
        )}

        <Button onClick={handleGenerate} disabled={generating || !isFormValid} className="gap-2">
          {generating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileDown className="size-4" aria-hidden />
          )}
          {generating ? "Starting…" : "Generate Cheatsheet PDF"}
        </Button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden />
        {aiEnabled ? "AI summaries enabled" : "Basic extractive mode"} · language {options.language || "—"}
      </p>
    </div>
  );
}
