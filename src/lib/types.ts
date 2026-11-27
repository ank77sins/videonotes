export type LlmProvider = "gemini" | "groq" | "openrouter" | "ollama" | "none";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export type NotesStyle = "notes" | "outline" | "study-guide" | "qa";
export type Depth = "brief" | "standard" | "detailed";
export type Tone = "neutral" | "academic" | "casual" | "professional";

export interface PdfOptions {
  audience: string;
  depth: Depth;
  language: string;
  tone: Tone;
  includeSlides: boolean;
  includeTimestamps: boolean;
  includeTranscript: boolean;
  style: NotesStyle;
  coverTitle: string;
  author: string;
}

export const DEFAULT_OPTIONS: PdfOptions = {
  audience: "General learners",
  depth: "standard",
  language: "English",
  tone: "neutral",
  includeSlides: true,
  includeTimestamps: true,
  includeTranscript: true,
  style: "notes",
  coverTitle: "",
  author: "",
};

export interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

export interface VideoMeta {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds?: number;
  url: string;
}

export interface SlideItem {
  index: number;
  timestamp: number;
  imagePath: string;
  ocrText: string;
  caption: string;
}

export interface NotesSection {
  heading: string;
  timestamp?: number;
  bullets: string[];
}

export interface NotesDocument {
  summary: string;
  sections: NotesSection[];
  keyTakeaways: string[];
  questions?: { q: string; a: string }[];
}

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface JobRecord {
  id: string;
  url: string;
  videoId: string | null;
  title: string | null;
  channel: string | null;
  thumbnail: string | null;
  duration: number | null;
  status: JobStatus;
  step: string | null;
  progress: number;
  message: string | null;
  options: string | null;
  error: string | null;
  pdfPath: string | null;
  slidesCount: number;
  provider: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface JobView {
  id: string;
  url: string;
  videoId: string | null;
  title: string | null;
  channel: string | null;
  thumbnail: string | null;
  duration: number | null;
  status: JobStatus;
  step: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  slidesCount: number;
  provider: string | null;
  createdAt: number;
  hasPdf: boolean;
}
