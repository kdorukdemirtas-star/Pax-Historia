# Pax-Historia (Local, Ollama-powered)

A self-hosted geopolitical strategy game inspired by [Pax Historia](https://paxhistoria.com) /
[Open Historia](https://github.com/Open-Historia/open-historia) — pick a country on a world map,
manage its economy, military and diplomacy, and let a **local Ollama model** (no cloud API key
needed) narrate world events, roleplay rival nations in diplomatic chat, and act as your
strategic advisor.

Everything runs on your machine: the game server, the client, and the AI (via
[Ollama](https://ollama.com)). Nothing is sent to a third-party API.

## Features

- **Interactive world map** (MapLibre GL) of every country, colored by owner, click any country
  to inspect its stats or open diplomacy.
- **AI-generated world events** every turn, shaped by your nation's and neighbors' current state.
- **Diplomacy chat** — talk to any AI-controlled nation in natural language; the model roleplays
  that nation's leader and can shift relations based on the conversation.
- **AI advisor** — a chat panel that gives strategic guidance based on your nation's current
  situation.
- **Troop deployment** — send troops to a bordering country; if it's hostile territory, next
  turn resolves a simple strength-based battle; if it's your own owned territory, it's just a
  repositioning.
- **Turn-based simulation** — advance the "month", stats drift, events fire, and troop orders
  resolve.
- **100% local** — the only external dependency is your own local Ollama instance.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.com/download) installed and running locally, with a model pulled, e.g.:

```bash
ollama pull llama3.1
ollama serve   # usually started automatically by the Ollama app/installer
```

Any chat-capable Ollama model works — smaller/faster models (e.g. `llama3.2:3b`, `qwen2.5:7b`)
give quicker turns, larger ones give better roleplay and narration.

## Setup

```bash
npm run setup     # installs server + client dependencies
npm run build:client
npm start          # builds nothing extra, just starts the server on the already-built client
```

Then open **http://localhost:3000**.

For active development (hot-reloading client), run these in two terminals instead:

```bash
npm run server       # backend on :3000
npm run dev:client    # frontend on :5173, proxies /api to :3000
```

## Configuration

Environment variables (set before `npm run server` / `npm start`):

| Variable       | Default                  | Description                          |
|----------------|---------------------------|---------------------------------------|
| `OLLAMA_HOST`  | `http://localhost:11434`  | URL of your local Ollama server       |
| `OLLAMA_MODEL` | `llama3.1`                 | Model name to use for all AI features |
| `PORT`         | `3000`                     | Port the game server listens on       |

Example:

```bash
OLLAMA_MODEL=llama3.2:3b PORT=4000 npm start
```

## How it works

- `scripts/build-scenario.mjs` builds `server/data/world.min.geojson` (country borders) and
  `server/data/scenario.json` (starting stats, treasury, troops, and computed border adjacency)
  from a Natural Earth countries dataset (`server/data/world.geojson`). Re-run it any time you
  want to regenerate the starting scenario.
- `server/server.js` is a small Express API: game state, turn advancement, troop deployment,
  diplomacy chat, and advisor chat.
- `server/ollama.js` is the only place that talks to Ollama — swap it out if you want to point
  at a different local inference server that exposes an Ollama-compatible `/api/chat` endpoint.
- `server/simulation.js` contains the turn/battle/diplomacy/advisor logic and the prompts sent
  to the model.
- `client/` is a Vite + React front-end (MapLibre GL map, stat panels, event feed, and chat
  modals for diplomacy/advisor).

Game state (which country you're playing, world stats, event log, diplomacy history) is kept in
memory and persisted to `server/data/save.json` after every change, and reloaded automatically
on server restart. Delete that file (or call `POST /api/game/reset`) to start over.

## Notes / limitations vs. the original

This is a from-scratch, simplified reimplementation focused on the core Pax Historia loop
(map + turns + AI events + diplomacy + advisor + troops) rather than a byte-for-byte clone. It
does not (yet) include the scenario hub/community sharing, the full map editor, or historical
scenario presets beyond the single "Modern Day" starting scenario — but the architecture (a
plain JSON scenario file + adjacency graph) is straightforward to extend with more scenarios.
