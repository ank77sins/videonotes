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
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import type { LlmProvider } from "@/lib/types";

const PROVIDERS: { value: LlmProvider; label: string; hint: string }[] = [
  { value: "none", label: "No AI (basic mode)", hint: "Offline extractive summaries. No key needed." },
  { value: "gemini", label: "Google Gemini", hint: "Free API key from Google AI Studio." },
  { value: "groq", label: "Groq", hint: "Fast free-tier inference." },
  { value: "openrouter", label: "OpenRouter", hint: "Many models, some free." },
  { value: "ollama", label: "Ollama (local)", hint: "Runs on your machine at localhost:11434." },
];

const MODEL_HINTS: Record<LlmProvider, string> = {
  none: "",
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.0-flash-exp:free",
  ollama: "llama3.1",
};

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

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const provider = PROVIDERS.find((p) => p.value === draft.provider);
  const needsKey = draft.provider !== "none" && draft.provider !== "ollama";

  const save = () => {
    onSave(draft);
    onOpenChange(false);
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
              onValueChange={(v) => setDraft({ ...draft, provider: v as LlmProvider })}
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
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                placeholder="Paste your key"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
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
                Ollama must run where the app server can reach it. It can&apos;t run inside this
                sandbox.
              </p>
            </div>
          ) : null}

          {draft.provider !== "none" ? (
            <div className="space-y-2">
              <Label htmlFor="model">Model (optional)</Label>
              <Input
                id="model"
                placeholder={MODEL_HINTS[draft.provider]}
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_SETTINGS })} type="button">
            Reset
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
