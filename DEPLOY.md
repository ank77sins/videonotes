# Deploying VideoNotes

VideoNotes is a long-running server app: it downloads video with `yt-dlp`, extracts
frames with `ffmpeg`, runs OCR, and renders PDFs with `pdfkit`. It stores history in
SQLite and files on disk.

Because of that it **must run on a container host with a persistent disk** — not on
serverless (Vercel/Netlify) and not on a platform that wipes the filesystem.

The repo ships a `Dockerfile`, so any container host works. Pick one:

## Option A — Render (easiest, has a free tier)

1. Push this repo to GitHub.
2. On <https://render.com> → **New → Blueprint** → pick the repo.
   `render.yaml` is detected automatically and creates the service + a 5 GB disk
   mounted at `/app/data`.
3. Click **Apply**. First build takes ~5 min.
4. Open the URL Render gives you. Done.

## Option B — Railway

1. Push the repo to GitHub.
2. <https://railway.app> → **New Project → Deploy from GitHub repo**.
3. Railway builds the `Dockerfile` automatically.
4. Add a **Volume** mounted at `/app/data` (Settings → Volumes).
5. Set env `PORT=4000`, then open the generated domain.

## Option C — Fly.io

```bash
fly launch --dockerfile Dockerfile --no-deploy
fly volumes create data --size 5
# in fly.toml set: [mounts] source = "data" destination = "/app/data"
fly deploy
```

## Option D — Any VPS / Docker host

```bash
docker build -t videonotes .
docker run -d --name videonotes -p 4000:4000 \
  -v videonotes-data:/app/data \
  --restart unless-stopped videonotes
```

## Environment variables

| Name       | Default | Purpose                                        |
| ---------- | ------- | ---------------------------------------------- |
| `PORT`     | `4000`  | HTTP port                                      |
| `NODE_ENV` | —       | Set to `production`                            |

No API keys are required — the app runs fully offline with its built-in summarizer.
Users can optionally add a free Gemini / Groq / OpenRouter key (or a local Ollama URL)
in the in-app Settings to get AI-written notes.

## Data & backups

Everything lives under `/app/data`:

- `app.db` — SQLite history (WAL mode)
- `pdfs/` — generated PDFs
- `frames/` — temporary video frames (auto-swept)

Back up the volume to keep users' history. Frame directories older than 60 minutes
are cleaned on startup automatically.

## Health check

`GET /api/health` returns `{"ok":true,"status":"healthy"}` — wire this to your
platform's health check.
