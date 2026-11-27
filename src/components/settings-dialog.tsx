"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_SETTINGS, PROVIDER_BASE_URLS, PROVIDER_MODELS, toLlmConfig, type Settings } from "@/lib/settings";
import type { LlmProvider } from "@/lib/types";

const PROVIDERS: { value: LlmProvider; label: string; hint: string }[] = [
  { value: "nvidia", label: "NVIDIA NIM (fastest)", hint: "Free API key from build.nvidia.com. Very fast hosted models." },
  { value: "groq", label: "Groq (very fast)", hint: "Free API key from console.groq.com. Fastest hosted inference." },
  { value: "gemini", label: "Google Gemini", hint: "Free API key from Google AI Studio." },
  { value: "openrouter", label: "OpenRouter", hint: "Many models, some free." },
  { value: "custom", label: "Custom / free LLM API", hint: "Any OpenAI-compatible endpoint: paste the base URL, key and model." },
  { value: "ollama", label: "Ollama (local)", hint: "Runs on your machine. Slower on CPU, fully private." },
  { value: "none", label: "No AI (basic mode)", hint: "Offline extractive summaries. No key needed." },
];

const MODEL_HINTS: Record<LlmProvider, string> = {
  none: "",
  gemini: PROVIDER_MODELS.gemini ?? "",
  groq: PROVIDER_MODELS.groq ?? "",
  openrouter: PROVIDER_MODELS.openrouter ?? "",
  nvidia: PROVIDER_MODELS.nvidia ?? "",
  custom: "auto",
  ollama: PROVIDER_MODELS.ollama ?? "",
};

function isCloudProvider(provider: LlmProvider): boolean {
  return provider !== "none" && provider !== "ollama";
}

function canListModels(provider: LlmProvider): boolean {
  return provider === "ollama" || provider === "custom" || provider === "nvidia" || provider === "groq" || provider === "openrouter";
}

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok"; reply: string } | { kind: "error"; error: string };

export function SettingsDialog({
  settings,
  onSave,
  open,
  onOpenChange,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setTest({ kind: "idle" });
    }
  }, [open, settings]);

  const provider = PROVIDERS.find((p) => p.value === draft.provider);
  const needsKey = draft.provider !== "none" && draft.provider !== "ollama";

  const effectiveModel =
    draft.model?.trim() ||
    (models.length && canListModels(draft.provider) ? models[0] : "");

  const fetchModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; models?: string[]; error?: string };
      if (data.ok) {
        const list = data.models ?? [];
        setModels(list);
        if (!list.length) {
          setModelsError(
            draft.provider === "ollama"
              ? "Ollama is running but has no models. Run `ollama pull qwen2.5:7b`."
              : "No models returned. Type the model name instead.",
          );
        } else {
          setDraft((prev) =>
            prev.model && list.includes(prev.model) ? prev : { ...prev, model: list[0] },
          );
        }
      } else {
        setModels([]);
        setModelsError(data.error ?? "Could not list models.");
      }
    } catch (err) {
      setModels([]);
      setModelsError(err instanceof Error ? err.message : "Could not list models.");
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (open && draft.provider === "ollama") void fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft.provider]);

  const save = () => {
    onSave({ ...draft, model: effectiveModel });
    onOpenChange(false);
  };

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm: toLlmConfig({ ...draft, model: effectiveModel }) }),
      });
      const data = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
      if (data.ok) setTest({ kind: "ok", reply: data.reply ?? "" });
      else setTest({ kind: "error", error: data.error ?? "Connection failed." });
    } catch (err) {
      setTest({ kind: "error", error: err instanceof Error ? err.message : "Connection failed." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI provider</DialogTitle>
          <DialogDescription>
            Keys are stored in your browser only and sent per request. They are never saved on the
            server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={draft.provider}
              onValueChange={(v) => {
                const next = v as LlmProvider;
                setModels([]);
                setModelsError(null);
                setDraft({
                  ...draft,
                  provider: next,
                  baseUrl: PROVIDER_BASE_URLS[next] ?? "",
                  model: "",
                });
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider?.hint ? <p className="text-xs text-muted-foreground">{provider.hint}</p> : null}
          </div>

          {needsKey ? (
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                API key{draft.provider === "custom" ? " (optional for local servers)" : ""}
              </Label>
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                placeholder="Paste your key"
                value={draft.apiKey}
                onChange={(e) => {
                  setModels([]);
                  setModelsError(null);
                  setDraft({ ...draft, apiKey: e.target.value });
                }}
                onBlur={() => {
                  if (canListModels(draft.provider) && draft.baseUrl.trim() && draft.apiKey.trim()) {
                    void fetchModels();
                  }
                }}
              />
            </div>
          ) : null}

          {draft.provider === "ollama" ? (
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Ollama URL</Label>
              <Input
                id="baseUrl"
                type="url"
                placeholder="http://localhost:11434"
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Default is http://localhost:11434. The app talks to Ollama from its own server, so
                keep it running in the background.
              </p>
            </div>
          ) : null}

          {draft.provider === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="baseUrl">API base URL</Label>
              <Input
                id="baseUrl"
                type="url"
                placeholder="https://api.inferbase.ai/v1"
                value={draft.baseUrl}
                onChange={(e) => {
                  setModels([]);
                  setModelsError(null);
                  setDraft({ ...draft, baseUrl: e.target.value });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Copy the <code>base_url</code> from your provider&apos;s dashboard. It usually ends
                in <code>/v1</code>. For Inferbase use{" "}
                <code>https://api.inferbase.ai/v1</code>.
              </p>
            </div>
          ) : null}

          {draft.provider !== "none" ? (
            <div className="space-y-2">
              <Label htmlFor="model">
                Model{" "}
                {draft.provider === "ollama" || draft.provider === "custom" ? "" : "(optional)"}
              </Label>
              {canListModels(draft.provider) && models.length ? (
                <Select
                  value={effectiveModel}
                  onValueChange={(v) => setDraft({ ...draft, model: v })}
                >
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="model"
                  placeholder={MODEL_HINTS[draft.provider]}
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                />
              )}
              {canListModels(draft.provider) ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="w-full"
                  onClick={() => void fetchModels()}
                  disabled={loadingModels}
                >
                  {loadingModels
                    ? "Loading models…"
                    : models.length
                      ? `Refresh models (${models.length})`
                      : "Load models from provider"}
                </Button>
              ) : null}
              {modelsError ? (
                <p className="text-xs text-destructive">{modelsError}</p>
              ) : canListModels(draft.provider) && models.length ? (
                <p className="text-xs text-muted-foreground">
                  {models.length} models available from this provider. Pick one from the list.
                </p>
              ) : canListModels(draft.provider) ? (
                <p className="text-xs text-muted-foreground">
                  Paste your key and base URL, then click Load models to see what you can use. You
                  can also type a model name.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {test.kind === "ok" ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Connected — model replied “{test.reply || "ok"}”.
          </p>
        ) : null}
        {test.kind === "error" ? (
          <p className="text-xs text-destructive">Couldn&apos;t connect: {test.error}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_SETTINGS })} type="button">
            Reset
          </Button>
          <div className="flex items-center gap-2">
            {draft.provider !== "none" ? (
              <Button
                variant="outline"
                type="button"
                onClick={runTest}
                disabled={test.kind === "testing"}
              >
                {test.kind === "testing" ? "Testing…" : "Test connection"}
              </Button>
            ) : null}
            <Button onClick={save}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
