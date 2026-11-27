import fs from "node:fs";
import path from "node:path";
import bidiFactory from "bidi-js";

export type Script = "base" | "devanagari" | "cjk";

export interface RegisteredFonts {
  body: string;
  bodyBold: string;
  hasUnicode: boolean;
  hasDevanagari: boolean;
  hasCjk: boolean;
}

interface Family {
  script: Script;
  regular?: string;
  bold?: string;
}

const DEVANAGARI = /[\u0900-\u097F\u1CD0-\u1CFF\uA8E0-\uA8FF]/;
const CJK = /[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/;
const RTL = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function resolve(candidates: string[]): string | undefined {
  for (const rel of candidates) {
    const full = path.join(process.cwd(), "node_modules", rel);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

function findFamily(dir: string, pattern: RegExp): string | undefined {
  const base = path.join(process.cwd(), "node_modules", dir);
  if (!fs.existsSync(base)) return undefined;
  const walk = (d: string, depth: number): string | undefined => {
    if (depth > 3) return undefined;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full, depth + 1);
        if (found) return found;
      } else if (pattern.test(entry.name)) {
        return full;
      }
    }
    return undefined;
  };
  return walk(base, 0);
}

function loadFamilies(): Family[] {
  const families: Family[] = [];

  const baseRegular = resolve([
    "dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
    "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf",
  ]);
  const baseBold = resolve([
    "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
    "@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf",
  ]);
  if (baseRegular) families.push({ script: "base", regular: baseRegular, bold: baseBold });

  const devRegular = findFamily("@expo-google-fonts/noto-sans-devanagari", /400Regular\.ttf$/);
  const devBold = findFamily("@expo-google-fonts/noto-sans-devanagari", /700Bold\.ttf$/);
  if (devRegular) families.push({ script: "devanagari", regular: devRegular, bold: devBold });

  const cjkRegular = findFamily("@expo-google-fonts/noto-sans-sc", /400Regular\.ttf$/);
  const cjkBold = findFamily("@expo-google-fonts/noto-sans-sc", /700Bold\.ttf$/);
  if (cjkRegular) families.push({ script: "cjk", regular: cjkRegular, bold: cjkBold });

  return families;
}

export function registerFonts(doc: PDFKit.PDFDocument): RegisteredFonts {
  const families = loadFamilies();
  const names: Record<string, string> = {};

  for (const family of families) {
    for (const weight of ["regular", "bold"] as const) {
      const file = family[weight];
      if (!file) continue;
      const name = `app-${family.script}-${weight}`;
      try {
        doc.registerFont(name, file);
        names[`${family.script}-${weight}`] = name;
      } catch {
        // skip unreadable font
      }
    }
  }

  const hasUnicode = Boolean(names["base-regular"]);
  return {
    body: names["base-regular"] ?? "Helvetica",
    bodyBold: names["base-bold"] ?? (hasUnicode ? names["base-regular"] : "Helvetica-Bold"),
    hasUnicode,
    hasDevanagari: Boolean(names["devanagari-regular"]),
    hasCjk: Boolean(names["cjk-regular"]),
  };
}

export function scriptOf(char: string): Script {
  if (DEVANAGARI.test(char)) return "devanagari";
  if (CJK.test(char)) return "cjk";
  return "base";
}

export function detectScripts(text: string): { devanagari: boolean; cjk: boolean; rtl: boolean } {
  return {
    devanagari: DEVANAGARI.test(text),
    cjk: CJK.test(text),
    rtl: RTL.test(text),
  };
}

export function fontNameFor(
  script: Script,
  bold: boolean,
  fonts: RegisteredFonts,
): string {
  if (script === "devanagari" && fonts.hasDevanagari) return `app-devanagari-${bold ? "bold" : "regular"}`;
  if (script === "cjk" && fonts.hasCjk) return `app-cjk-${bold ? "bold" : "regular"}`;
  return bold ? fonts.bodyBold : fonts.body;
}

let bidi: ReturnType<typeof bidiFactory> | null = null;

export function visualOrder(text: string): string {
  if (!RTL.test(text)) return text;
  try {
    if (!bidi) bidi = bidiFactory();
    const levels = bidi.getEmbeddingLevels(text, "auto");
    return bidi.getReorderedString(text, levels);
  } catch {
    return text;
  }
}

export interface Run {
  text: string;
  script: Script;
}

export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  for (const char of text) {
    const script = scriptOf(char);
    if (current && current.script === script) {
      current.text += char;
    } else {
      current = { text: char, script };
      runs.push(current);
    }
  }
  return runs;
}
