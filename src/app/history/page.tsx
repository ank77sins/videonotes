"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Download, ExternalLink, FileText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { JobView } from "@/lib/types";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JobView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load history.");
        return;
      }
      setJobs(data.jobs as JobView[]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (job: JobView) => {
    setPendingDelete(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete that item.");
        return;
      }
      setJobs((prev) => (prev ? prev.filter((j) => j.id !== job.id) : prev));
      toast.success("Deleted");
    } catch {
      toast.error("Network error while deleting.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden />
              New PDF
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your PDFs</h1>
          <p className="text-sm text-muted-foreground">
            Generated documents from this session. They&apos;re stored on this server.
          </p>
        </div>

        {loading && !jobs ? (
          <div className="flex items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Loading history…
          </div>
        ) : error ? (
          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void load()}>Try again</Button>
            </CardContent>
          </Card>
        ) : jobs && jobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <FileText className="size-8 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">No PDFs yet</p>
                <p className="text-sm text-muted-foreground">
                  Generate your first study PDF from a YouTube link.
                </p>
              </div>
              <Button asChild>
                <Link href="/">Create a PDF</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {jobs?.map((job) => (
              <li key={job.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{job.title ?? "Untitled video"}</p>
                        <Badge variant={job.status === "done" ? "default" : job.status === "error" ? "destructive" : "secondary"}>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {job.channel ?? "Unknown channel"} · {format(job.createdAt, "d MMM yyyy, HH:mm")}
                        {job.slidesCount > 0 ? ` · ${job.slidesCount} slides` : ""}
                      </p>
                      {job.error ? <p className="text-xs text-destructive">{job.error}</p> : null}
                    </div>

                    <div className="flex flex-none items-center gap-2">
                      {job.hasPdf ? (
                        <>
                          <Button asChild size="sm" className="gap-2">
                            <a href={`/api/pdf/${job.id}?download=1`}>
                              <Download className="size-4" aria-hidden />
                              Download
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="gap-2">
                            <a href={`/api/pdf/${job.id}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-4" aria-hidden />
                              Open
                            </a>
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        onClick={() => setPendingDelete(job)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title ?? "This item"}&rdquo; and its file will be permanently
              removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && void remove(pendingDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
