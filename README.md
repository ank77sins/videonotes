# VideoNotes

Turn any YouTube video into a **study PDF** — summary, key takeaways, structured notes,
slide screenshots with OCR, and the full transcript.

Runs **entirely on your own computer**. No account, no cloud, no API key required.
Your videos, transcripts, and PDFs never leave your machine.

---

## Quick start

You need [Node.js 20+](https://nodejs.org). That's it.

```bash
git clone https://github.com/ank77sins/videonotes.git
cd videonotes
./setup.sh          # macOS / Linux
```

On Windows, double-click **`setup.bat`** (or run it in a terminal).

Then start it:

```bash
bun run dev     # if you have bun
npm run dev     # otherwise
```

Open **http://localhost:3000** → paste a YouTube link → done.

> `setup.sh` / `setup.bat` check your environment, install dependencies, and tell you
> exactly what (if anything) is missing.

---

## AI notes — pick your speed

Without any setup the app writes solid notes using a built-in extractive summarizer.
For AI-written notes, open **Settings** and pick a provider.

### Fastest: hosted models (seconds)

| Provider | Key from | Why |
| --- | --- | --- |
| **NVIDIA NIM** | [build.nvidia.com](https://build.nvidia.com) | Very fast hosted models, generous free tier |
| **Groq** | [console.groq.com](https://console.groq.com) | Fastest hosted inference available |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) | Free, long context |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | Many models, some free |
| **Custom / free LLM API** | your provider | Any [OI]-compatible endpoint: base URL + key + model |

For **Inferbase**, choose *Custom / free LLM API* and fill in:

| Field | Value |
| --- | --- |
| API key | the key from your Inferbase dashboard |
| API base URL | `https://api.inferbase.ai/v1` |
| Model | click **Load models**, then pick `auto` (or a specific model) |

Click **Load models** for any provider to see the exact model names it serves —
no guessing required.

Hosted providers process transcript sections **6 at a time** and handle the whole
transcript in a single pass, so a 20-minute video typically finishes in **10–30 seconds**.

### What the PDF looks like

The AI rebuilds the transcript as a structured document instead of a transcript dump:

- **Cover**, then a **Contents** page listing every section.
- **Overview** (2–4 lines) and up to **5 Key Takeaways**, all taken from the video.
- **Sections** with descriptive headings (never "Part 1"), written as short
  paragraphs, bullet lists, numbered steps for procedures, and tables for
  comparisons or numbers.
- **Sub-headings** where a topic breaks into smaller points.
- Optional **Review Questions**, and one line listing excluded sponsor/promo segments.

Rules the model follows: no information loss, no invented content, no commentary,
filler removed, garbled speech marked `[unclear: ...]`, and the speaker's
unverified claims attributed to them. If the AI call fails, the PDF is built in
basic offline mode and says so on the cover.

### Private: local with Ollama (minutes)

Everything stays on your machine. Install [Ollama](https://ollama.com/download):

```bash
ollama pull llama3.2:3b      # ~2 GB, runs on 8 GB RAM laptops
ollama serve                 # usually already running
```

In the app: **Settings → Provider → Ollama (local)** — the model dropdown lists
whatever you have installed. Click **Test connection** to confirm.

| Model | Download | RAM to run | Notes |
| --- | --- | --- | --- |
| `llama3.2:1b` | ~1.3 GB | 4 GB | Fastest, weakest |
| `llama3.2:3b` | ~2 GB | 8 GB | Good default for small laptops |
| **`qwen2.5:7b`** | **~4.7 GB** | **12–16 GB** | **Best pick if you have 16 GB** — strongest at strict JSON |
| `llama3.1:8b` | ~4.9 GB | 16 GB | Good all-rounder |
| `mistral` | ~4.1 GB | 12 GB | Fast, older |

**Skip vision models** (`llava`, `qwen2.5vl`). Slide captions are built from OCR text,
so a vision model costs several GB for little benefit.

Check whether Ollama is using your GPU:

```bash
ollama ps        # PROCESSOR column: 100% GPU = fast, 100% CPU = slow
```

### Switching or removing models

```bash
ollama list                  # see what's installed
ollama pull qwen2.5:7b       # download a better one (old one stays)
ollama rm llama3.2:3b        # delete the old one to free disk space
```

Then in the app: **Settings → Ollama → Refresh list → pick the new model → Save**.

---

## What you get in the PDF

- Cover page with title, author, and video link
- Table of contents
- Summary and key takeaways
- Structured sections with timestamps
- Slide screenshots with OCR text and captions
- Full transcript
- Correct rendering for non-Latin scripts (Devanagari, Arabic, CJK)

## Requirements

| Thing | Needed? | Notes |
| --- | --- | --- |
| Node.js 20+ | **Yes** | https://nodejs.org |
| ffmpeg | Recommended | Needed for slide capture. `brew install ffmpeg` / `apt install ffmpeg` / `winget install Gyan.FFmpeg` |
| Ollama | Optional | For local AI notes |
| Python / yt-dlp | No | Bundled via npm |

The app works without ffmpeg — it just skips the slides section.

## How it works

1. Fetches the transcript from YouTube.
2. Downloads the video and extracts slide frames (ffmpeg), de-duplicates them, and
   runs OCR (Tesseract) plus optional captions.
3. Summarizes and structures the content (local Ollama, a cloud key, or built-in).
4. Renders a PDF (pdfkit) with embedded fonts.

History and generated PDFs are stored locally in `data/` (SQLite). Delete that folder
to reset. Nothing is uploaded anywhere.

## Troubleshooting

**"No transcript available"** — the video has captions disabled. Use the paste-transcript
option, or upload a `.srt` / `.vtt` file.

**Slides are missing** — ffmpeg isn't installed. See Requirements above.

**Ollama errors** — make sure `ollama serve` is running and the model is pulled
(`ollama list`). The app defaults to `http://localhost:11434`.

**Port already in use** — `npm run dev -- -p 3001`.

## Deploying instead of running locally?

See [DEPLOY.md](./DEPLOY.md) for Docker / Render / Railway / Fly instructions.

## License

MIT
