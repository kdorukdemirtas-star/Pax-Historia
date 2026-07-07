#!/usr/bin/env bash
# One-click launcher for Linux/macOS.
# Checks Node.js, installs dependencies, builds the client, and starts the game.
set -e
cd "$(dirname "$0")"

echo "==> Pax Historia (Local) launcher"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js is required but was not found."
  echo "Install it from https://nodejs.org/ (LTS version) and re-run this script."
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18+ is required (found $(node -v)). Please update Node.js."
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo ""
  echo "WARNING: 'ollama' was not found on your PATH."
  echo "Install it from https://ollama.com/download so the game's AI features work."
  echo "You can still browse the map without it, but events/diplomacy/advisor will fail."
  echo ""
fi

if [ ! -d node_modules ]; then
  echo "==> Installing server dependencies..."
  npm install
fi

if [ ! -d client/node_modules ]; then
  echo "==> Installing client dependencies..."
  (cd client && npm install)
fi

if [ ! -d client/dist ]; then
  echo "==> Building the client (first run)..."
  npm run build:client
fi

# Make sure a model is pulled if Ollama is available and no models exist yet.
if command -v ollama >/dev/null 2>&1; then
  if ! ollama list 2>/dev/null | grep -q ":"; then
    echo ""
    echo "No local Ollama models found. Pulling a default model (llama3.1)..."
    echo "This may take a while the first time. You can Ctrl+C and pull a smaller"
    echo "model yourself later, e.g.: ollama pull llama3.2:3b"
    ollama pull llama3.1 || echo "Model pull failed or was skipped; you can pull one manually later."
  fi
fi

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

echo ""
echo "==> Starting Pax Historia (Local) on ${URL}"
( sleep 2
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1
  fi
) &

node server/server.js
