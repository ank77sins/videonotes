#!/usr/bin/env bash
set -euo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

bold "VideoNotes — local setup"
echo

# --- Node -------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    die "Node.js 20 or newer is required (found $(node -v)). Install from https://nodejs.org"
  fi
  ok "Node.js $(node -v)"
else
  die "Node.js not found. Install Node.js 20+ from https://nodejs.org and re-run this script."
fi

# --- ffmpeg -----------------------------------------------------------------
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg found"
else
  warn "ffmpeg not found. Slide extraction will be skipped."
  case "$(uname -s)" in
    Darwin) echo "    Install with:  brew install ffmpeg" ;;
    Linux)  echo "    Install with:  sudo apt install ffmpeg   (or your distro's package manager)" ;;
    *)      echo "    Install ffmpeg from https://ffmpeg.org/download.html" ;;
  esac
fi

# --- dependencies -----------------------------------------------------------
bold "Installing dependencies..."
if command -v bun >/dev/null 2>&1; then
  bun install
  PKG=bun
elif command -v npm >/dev/null 2>&1; then
  npm install
  PKG=npm
else
  die "Neither bun nor npm found. Install Node.js 20+ which includes npm."
fi
ok "Dependencies installed"

# --- Ollama (optional) ------------------------------------------------------
echo
bold "Optional: local AI with Ollama"
if command -v ollama >/dev/null 2>&1; then
  ok "Ollama is installed"
  echo "    Start it:            ollama serve"
  echo "    Pull a small model:  ollama pull llama3.2:3b"
  echo "    Then in the app: Settings → Provider = Ollama (local)"
else
  warn "Ollama not installed (the app still works without it, using basic notes)."
  echo "    Get private, fully-offline AI notes:  https://ollama.com/download"
  echo "    Then:  ollama pull llama3.2:3b"
fi

echo
bold "Done. Start the app with:"
if [ "$PKG" = "bun" ]; then
  echo "    bun run dev"
else
  echo "    npm run dev"
fi
echo
echo "Then open http://localhost:3000 in your browser."
