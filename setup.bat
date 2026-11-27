@echo off
setlocal enabledelayedexpansion
echo VideoNotes - local setup
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js not found. Install Node.js 20+ from https://nodejs.org and run this again.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js !NODEVER!

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [!] ffmpeg not found. Slide extraction will be skipped.
  echo     Install with: winget install Gyan.FFmpeg
) else (
  echo [OK] ffmpeg found
)

echo.
echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo [X] Dependency install failed.
  pause
  exit /b 1
)
echo [OK] Dependencies installed

echo.
echo Optional: local AI with Ollama
where ollama >nul 2>nul
if errorlevel 1 (
  echo [!] Ollama not installed - the app still works, using basic notes.
  echo     For private offline AI: https://ollama.com/download
  echo     Then run: ollama pull llama3.2:3b
) else (
  echo [OK] Ollama installed
  echo     Start it:           ollama serve
  echo     Pull a small model: ollama pull llama3.2:3b
  echo     Then in the app: Settings - Provider - Ollama ^(local^)
)

echo.
echo Done. Start the app with:
echo     npm run dev
echo.
echo Then open http://localhost:3000 in your browser.
pause
