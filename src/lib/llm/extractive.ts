const STOPWORDS = new Set(
  `a an the and or but if then than that this these those of in on at to for from by with as is are was were be been being it its it's i you he she they we them our your his her their not no so do does did have has had can could would should will just about into over after before more most some such only own same very too also very up down out off again further once here there when where why how all any both each few other`.split(
    /\s+/,
  ),
);

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function rankSentences(text: string): { sentence: string; score: number }[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const w of tokenize(s)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const maxFreq = Math.max(1, ...freq.values());

  const scored = sentences.map((sentence, idx) => {
    const words = tokenize(sentence);
    if (words.length === 0) return { sentence, score: 0 };
    let score = 0;
    for (const w of words) score += (freq.get(w) ?? 0) / maxFreq;
    score /= Math.sqrt(words.length);
    if (idx < 3) score *= 1.15;
    return { sentence, score };
  });

  return scored;
}

export function extractiveSummary(text: string, maxSentences = 6): string {
  const ranked = rankSentences(text);
  const top = ranked
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((r) => r.sentence);
  return top.join(" ");
}

export function extractiveKeyPoints(text: string, maxPoints = 8): string[] {
  return rankSentences(text)
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPoints)
    .sort((a, b) => a.i - b.i)
    .map((r) => r.sentence.replace(/^[-•\s]+/, ""));
}
