"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { JobView } from "@/lib/types";
import { VideoDownloadControl } from "./video-download";

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const PHASES = [
  { label: "Preparing", at: 3 },
  { label: "Capturing slides", at: 8 },
  { label: "Reading & describing", at: 40 },
  { label: "Writing notes", at: 72 },
  { label: "Building PDF", at: 92 },
  { label: "Done", at: 100 },
];

export function ProgressView({ jobId, onReset }: { jobId: string; onReset: () => void }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [jobId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Could not read job status.");
          return;
        }
        setJob(data.job as JobView);
        if (data.job.status === "running" || data.job.status === "queued") {
          timer = setTimeout(poll, 1500);
        }
      } catch {
        if (active) {
          setError("Lost connection while generating. Retrying…");
          timer = setTimeout(poll, 3000);
        }
      }
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  if (error && !job) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={onReset}>Start over</Button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center gap-3 py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading job…
      </div>
    );
  }

  const done = job.status === "done";
  const failed = job.status === "error";
  const cancelledState = job.status === "cancelled";
  const active = !done && !failed && !cancelledState;

  const cancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
      if (!res.ok) toast.error("Could not cancel the job.");
    } catch {
      toast.error("Network error while cancelling.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-medium">{job.title ?? "Your video"}</p>
          <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
            {job.progress}% · {formatElapsed(elapsed)}
          </span>
        </div>
        <Progress value={job.progress} aria-label="Generation progress" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {failed ? (
            <TriangleAlert className="size-4 text-destructive" aria-hidden />
          ) : cancelledState ? (
            <XCircle className="size-4 text-muted-foreground" aria-hidden />
          ) : done ? (
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {failed
            ? "Generation failed"
            : cancelledState
              ? "Cancelled"
              : done
                ? "Your PDF is ready"
                : (job.step ?? "Working")}
          {active && job.message ? ` — ${job.message}` : ""}
        </p>
        {active && job.provider === "ollama" ? (
          <p className="text-xs text-muted-foreground">
            Running on your local model. A 20-minute video usually takes a few minutes — the
            percentage can pause while the model writes.
          </p>
        ) : null}
        {active && job.provider && job.provider !== "ollama" && job.provider !== "none" ? (
          <p className="text-xs text-muted-foreground">
            Running on a hosted model — this usually takes seconds.
          </p>
        ) : null}
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void cancel()}
            disabled={cancelling}
            className="h-auto gap-2 px-0 text-muted-foreground"
          >
            {cancelling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null}
      </div>

      <ol className="space-y-2">
        {PHASES.map((phase) => {
          const complete = job.progress >= phase.at && !failed && !cancelledState;
          const phaseActive =
            !done &&
            !failed &&
            !cancelledState &&
            job.progress < phase.at &&
            job.progress >= (PHASES[PHASES.indexOf(phase) - 1]?.at ?? 0);
          return (
            <li key={phase.label} className="flex items-center gap-2 text-sm">
              <span
                className={
                  complete
                    ? "text-emerald-600"
                    : phaseActive
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }
              >
                {complete ? (
                  <CheckCircle2 className="size-4" aria-hidden />
                ) : phaseActive ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <span className="inline-block size-4 rounded-full border" aria-hidden />
                )}
              </span>
              <span className={complete || phaseActive ? "" : "text-muted-foreground/60"}>
                {phase.label}
                {phase.label === "Capturing slides" && job.slidesCount > 0
                  ? ` · ${job.slidesCount} slides`
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {cancelledState ? (
        <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">
            You cancelled this job. Nothing was saved.
          </p>
          <Button variant="outline" onClick={onReset} className="gap-2">
            <RotateCcw className="size-4" aria-hidden />
            Start again
          </Button>
        </div>
      ) : null}

      {failed ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{job.error ?? "Something went wrong."}</p>
          <Button variant="outline" onClick={onReset} className="gap-2">
            <RotateCcw className="size-4" aria-hidden />
            Try another video
          </Button>
        </div>
      ) : null}

      {done ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="gap-2">
              <a href={`/api/pdf/${job.id}?download=1`}>
                <Download className="size-4" aria-hidden />
                Download PDF
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a href={`/api/pdf/${job.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                Open in new tab
              </a>
            </Button>
            <VideoDownloadControl url={job.url} title={job.title ?? undefined} compact />
            <Button variant="ghost" onClick={onReset} className="gap-2">
              <RotateCcw className="size-4" aria-hidden />
              New video
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
