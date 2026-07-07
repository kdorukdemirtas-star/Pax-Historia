import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { checkOllama } from "./ollama.js";
import {
  getGame,
  resetGame,
  setPlayerCountry,
  getWorldGeoJSON,
  loadPersisted,
} from "./gameState.js";
import {
  advanceTurn,
  queueDeployment,
  diplomacyChat,
  advisorChat,
  dateLabelForGame,
} from "./simulation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

loadPersisted();

const app = express();
app.use(cors());
app.use(express.json());

const api = express.Router();

api.get("/status", async (_req, res) => {
  const ollama = await checkOllama();
  res.json({ ok: true, ollama });
});

api.get("/game", (_req, res) => {
  const game = getGame();
  res.json({
    turn: game.turn,
    year: game.year,
    date: dateLabelForGame(),
    scenarioName: game.scenarioName,
    playerCountry: game.playerCountry,
    countries: game.countries,
    events: game.events,
    pendingDeployments: game.pendingDeployments,
  });
});

api.get("/world.geojson", (_req, res) => {
  res.json(getWorldGeoJSON());
});

api.post("/game/reset", (_req, res) => {
  const game = resetGame();
  res.json({ ok: true, turn: game.turn });
});

api.post("/game/select-country", (req, res) => {
  try {
    const { countryId } = req.body;
    setPlayerCountry(countryId);
    res.json({ ok: true, playerCountry: countryId });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

api.post("/turn/advance", async (_req, res) => {
  try {
    const result = await advanceTurn();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

api.post("/troops/deploy", (req, res) => {
  try {
    const { from, to, troops } = req.body;
    const dep = queueDeployment({ from, to, troops });
    res.json({ ok: true, deployment: dep });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

api.get("/diplomacy/:countryId/log", (req, res) => {
  const game = getGame();
  res.json({ log: game.diplomacyLogs[req.params.countryId] || [] });
});

api.post("/diplomacy/:countryId/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const result = await diplomacyChat(req.params.countryId, message);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

api.get("/advisor/log", (_req, res) => {
  const game = getGame();
  res.json({ log: game.advisorLog || [] });
});

api.post("/advisor/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const result = await advisorChat(message);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use("/api", api);

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Open Historia (local) server listening on http://localhost:${PORT}`);
  console.log(`Ollama host: ${process.env.OLLAMA_HOST || "http://localhost:11434"}, model: ${process.env.OLLAMA_MODEL || "llama3.1"}`);
});
