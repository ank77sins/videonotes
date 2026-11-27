"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { JobView } from "@/lib/types";

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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-medium">{job.title ?? "Your video"}</p>
          <span className="tabular-nums text-sm text-muted-foreground">{job.progress}%</span>
        </div>
        <Progress value={job.progress} aria-label="Generation progress" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {failed ? (
            <TriangleAlert className="size-4 text-destructive" aria-hidden />
          ) : done ? (
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {failed ? "Generation failed" : done ? "Your PDF is ready" : (job.step ?? "Working")}
          {!done && !failed && job.message ? ` — ${job.message}` : ""}
        </p>
      </div>

      <ol className="space-y-2">
        {PHASES.map((phase) => {
          const complete = job.progress >= phase.at && !failed;
          const active =
            !done &&
            !failed &&
            job.progress < phase.at &&
            job.progress >= (PHASES[PHASES.indexOf(phase) - 1]?.at ?? 0);
          return (
            <li key={phase.label} className="flex items-center gap-2 text-sm">
              <span
                className={
                  complete
                    ? "text-emerald-600"
                    : active
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }
              >
                {complete ? (
                  <CheckCircle2 className="size-4" aria-hidden />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <span className="inline-block size-4 rounded-full border" aria-hidden />
                )}
              </span>
              <span className={complete || active ? "" : "text-muted-foreground/60"}>
                {phase.label}
                {phase.label === "Capturing slides" && job.slidesCount > 0
                  ? ` · ${job.slidesCount} slides`
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>

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
          <Button variant="ghost" onClick={onReset} className="gap-2">
            <RotateCcw className="size-4" aria-hidden />
            New video
          </Button>
        </div>
      ) : null}
    </div>
  );
}
