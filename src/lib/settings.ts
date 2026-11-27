import type { LlmConfig, LlmProvider } from "./types";

export interface Settings {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

const STORAGE_KEY = "ytpdf.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  provider: "none",
  apiKey: "",
  model: "",
  baseUrl: "http://localhost:11434",
};

export const PROVIDER_BASE_URLS: Partial<Record<LlmProvider, string>> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  ollama: "http://localhost:11434",
};

export const PROVIDER_MODELS: Partial<Record<LlmProvider, string>> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.0-flash-exp:free",
  nvidia: "meta/llama-3.3-70b-instruct",
  ollama: "llama3.2:3b",
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function toLlmConfig(settings: Settings): LlmConfig {
  return {
    provider: settings.provider,
    apiKey: settings.apiKey.trim() || undefined,
    model: settings.model.trim() || undefined,
    baseUrl: settings.baseUrl.trim() || undefined,
  };
}

export function isAiEnabled(settings: Settings): boolean {
  if (settings.provider === "none") return false;
  if (settings.provider === "ollama") return true;
  if (settings.provider === "custom") {
    return Boolean(settings.apiKey.trim() && settings.baseUrl.trim());
  }
  return Boolean(settings.apiKey.trim());
}
