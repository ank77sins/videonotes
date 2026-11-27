"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, History, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UrlForm, type LoadedVideo } from "@/components/url-form";
import { PdfOptionsForm } from "@/components/pdf-options-form";
import { ProgressView } from "@/components/progress-view";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  DEFAULT_SETTINGS,
  isAiEnabled,
  loadSettings,
  saveSettings,
  toLlmConfig,
  type Settings,
} from "@/lib/settings";
import type { PdfOptions } from "@/lib/types";

type Step = "link" | "options" | "progress";

const STEPS: { key: Step; label: string }[] = [
  { key: "link", label: "Link" },
  { key: "options", label: "Options" },
  { key: "progress", label: "PDF" },
];

export default function Home() {
  const [step, setStep] = useState<Step>("link");
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const saveSettingsAndClose = (next: Settings) => {
    saveSettings(next);
    setSettings(next);
    toast.success("AI settings saved");
  };

  const handleGenerate = async (options: PdfOptions) => {
    if (!video) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: video.meta,
          segments: video.segments,
          options,
          llm: toLlmConfig(settings),
          cookies: video.cookies,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Could not start generation.");
        return;
      }
      setJobId(data.id as string);
      setStep("progress");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setVideo(null);
    setJobId(null);
    setStep("link");
  };

  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <FileText className="size-5 text-primary" aria-hidden />
            VideoNotes
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href="/history">
                <History className="size-4" aria-hidden />
                <span className="hidden sm:inline">History</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon className="size-4" aria-hidden />
              <span className="hidden sm:inline">AI settings</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-8 space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Turn a YouTube video into a study PDF
          </h1>
          <p className="text-muted-foreground">
            Paste a link, choose how you want the notes, and download a PDF with the summary,
            slides, and full transcript.
          </p>
        </div>

        <ol className="mb-8 flex items-center gap-3 text-sm" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`flex items-center gap-2 ${i <= activeIndex ? "text-foreground" : "text-muted-foreground/60"}`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full border text-xs ${
                    i <= activeIndex ? "border-primary bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {i + 1}
                </span>
                {s.label}
              </span>
              {i < STEPS.length - 1 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
            </li>
          ))}
        </ol>

        <Card>
          <CardContent>
            {step === "link" ? (
              <UrlForm
                onLoaded={(v) => {
                  setVideo(v);
                  setStep("options");
                }}
              />
            ) : null}

            {step === "options" && video ? (
              <PdfOptionsForm
                video={video}
                aiEnabled={isAiEnabled(settings)}
                generating={generating}
                onBack={() => setStep("link")}
                onGenerate={handleGenerate}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            ) : null}

            {step === "progress" && jobId ? (
              <ProgressView jobId={jobId} onReset={reset} />
            ) : null}
          </CardContent>
        </Card>
      </main>

      <SettingsDialog
        settings={settings}
        onSave={saveSettingsAndClose}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
