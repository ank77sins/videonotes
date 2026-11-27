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

## Optional: private, fully-offline AI notes

Without any setup the app already writes solid notes using a built-in extractive
summarizer. For genuinely AI-written notes with **zero data leaving your machine**,
install [Ollama](https://ollama.com/download) and pull a small model:

```bash
ollama pull llama3.2:3b      # ~2 GB, runs on 8 GB RAM laptops
ollama serve                 # usually already running
```

In the app: **Settings → Provider → Ollama (local)**, model `llama3.2:3b`.

Larger models give better notes if your machine can handle them:

| Model | Size | Needs |
| --- | --- | --- |
| `llama3.2:1b` | ~1.3 GB | 4 GB RAM, fast |
| `llama3.2:3b` | ~2 GB | 8 GB RAM — good default |
| `qwen2.5:7b` | ~4.7 GB | 16 GB RAM, best quality |
| `mistral` | ~4 GB | 16 GB RAM |

### Prefer a cloud model?

Free API keys also work — Gemini, Groq, or OpenRouter. Add one in **Settings**.
Those requests do leave your machine (to that provider only).

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
