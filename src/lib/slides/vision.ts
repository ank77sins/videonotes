import fs from "node:fs";
import { vision } from "../llm";
import type { LlmConfig } from "../types";

export interface CaptionInput {
  path: string;
  ocrText: string;
  timestamp: number;
}

const MAX_CAPTIONED = 40;

export async function captionSlides(
  slides: CaptionInput[],
  cfg: LlmConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const captions: string[] = new Array(slides.length).fill("");
  const limit = Math.min(slides.length, MAX_CAPTIONED);
  for (let i = 0; i < limit; i++) {
    const slide = slides[i];
    try {
      const base64 = fs.readFileSync(slide.path).toString("base64");
      const hint = slide.ocrText ? ` Text detected on slide: "${slide.ocrText.slice(0, 600)}".` : "";
      const prompt = `You are describing a slide/frame captured from an educational video. Describe what it shows in 1-2 concise sentences for study notes. Focus on diagrams, charts, code, or key text.${hint}`;
      captions[i] = await vision(cfg, base64, "image/jpeg", prompt);
    } catch {
      captions[i] = "";
    }
    onProgress?.(i + 1, limit);
  }
  return captions;
}
