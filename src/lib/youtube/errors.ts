export type YoutubeErrorKind =
  | "bot-check"
  | "unavailable"
  | "private"
  | "no-captions"
  | "age-restricted"
  | "geo-blocked"
  | "timeout"
  | "unknown";

export interface ClassifiedError {
  kind: YoutubeErrorKind;
  message: string;
  guidance: string;
  retryable: boolean;
}

const PATTERNS: { kind: YoutubeErrorKind; test: RegExp }[] = [
  { kind: "bot-check", test: /confirm you.?re not a bot|sign in to confirm|not a bot|captcha|too many requests|429/i },
  { kind: "age-restricted", test: /age.?restrict|inappropriate for some users|confirm your age/i },
  { kind: "private", test: /private video|this video is private/i },
  { kind: "unavailable", test: /video unavailable|no longer available|has been removed|does not exist|410/i },
  { kind: "geo-blocked", test: /not available in your country|geo.?block|blocked it in your country/i },
  { kind: "no-captions", test: /no subtitle|subtitles are disabled|no captions|transcript is disabled/i },
  { kind: "timeout", test: /timed out|ETIMEDOUT|socket hang up|ECONNRESET/i },
];

const GUIDANCE: Record<YoutubeErrorKind, { message: string; guidance: string; retryable: boolean }> = {
  "bot-check": {
    message: "YouTube asked this server to verify it isn't a bot.",
    guidance:
      "Paste the transcript manually, or add YouTube cookies under Advanced. Cookies usually fix this.",
    retryable: true,
  },
  "age-restricted": {
    message: "This video is age-restricted.",
    guidance: "Sign in with cookies from an account that can view it, then try again.",
    retryable: false,
  },
  private: {
    message: "This video is private.",
    guidance: "Only the owner can access it. Try a public video, or add cookies for an account with access.",
    retryable: false,
  },
  unavailable: {
    message: "This video isn't available.",
    guidance: "Check the link is correct and the video hasn't been removed or region-locked.",
    retryable: false,
  },
  "geo-blocked": {
    message: "This video is blocked in this server's region.",
    guidance: "Add cookies from an account in an allowed region, or paste the transcript manually.",
    retryable: false,
  },
  "no-captions": {
    message: "This video has no captions available.",
    guidance: "Paste the transcript or upload an .srt/.vtt file to continue.",
    retryable: false,
  },
  timeout: {
    message: "YouTube took too long to respond.",
    guidance: "This is usually temporary. Try again in a moment.",
    retryable: true,
  },
  unknown: {
    message: "YouTube could not be reached for this video.",
    guidance: "Try again, or paste the transcript manually if it keeps failing.",
    retryable: true,
  },
};

export function classifyYoutubeError(err: unknown): ClassifiedError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const found = PATTERNS.find((p) => p.test.test(raw));
  const kind = found?.kind ?? "unknown";
  const base = GUIDANCE[kind];
  return {
    kind,
    message: base.message,
    guidance: base.guidance,
    retryable: base.retryable,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: ClassifiedError) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 700;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyYoutubeError(err);
      const isLast = attempt === attempts;
      if (isLast || !classified.retryable) throw err;
      const delay = baseDelay * 2 ** (attempt - 1);
      opts.onRetry?.(attempt, delay, classified);
      await sleep(delay);
    }
  }

  throw lastError;
}
