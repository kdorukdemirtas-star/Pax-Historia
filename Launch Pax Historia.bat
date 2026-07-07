@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==^> Pax Historia (Local) launcher

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is required but was not found on PATH.
  echo Install it from https://nodejs.org/ ^(LTS version^) and re-run this script.
  pause
  exit /b 1
)

where ollama >nul 2>nul
if errorlevel 1 (
  echo.
  echo WARNING: 'ollama' was not found on PATH.
  echo Install it from https://ollama.com/download so the game's AI features work.
  echo You can still browse the map without it, but events/diplomacy/advisor will fail.
  echo.
)

if not exist node_modules (
  echo ==^> Installing server dependencies...
  call npm install
)

if not exist client\node_modules (
  echo ==^> Installing client dependencies...
  pushd client
  call npm install
  popd
)

if not exist client\dist (
  echo ==^> Building the client ^(first run^)...
  call npm run build:client
)

where ollama >nul 2>nul
if not errorlevel 1 (
  ollama list | findstr ":" >nul 2>nul
  if errorlevel 1 (
    echo.
    echo No local Ollama models found. Pulling a default model ^(llama3.1^)...
    echo This may take a while the first time.
    ollama pull llama3.1
  )
)

if "%PORT%"=="" set PORT=3000

echo.
echo ==^> Starting Pax Historia (Local) on http://localhost:%PORT%
start "" "http://localhost:%PORT%"

node server\server.js
pause
