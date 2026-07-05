import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const SAVE_PATH = path.join(DATA_DIR, "save.json");

function loadScenario() {
  const raw = fs.readFileSync(path.join(DATA_DIR, "scenario.json"), "utf8");
  return JSON.parse(raw);
}

function freshGame() {
  const scenario = loadScenario();
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    startYear: scenario.startYear,
    turn: 0,
    year: scenario.startYear,
    playerCountry: null,
    countries: scenario.countries,
    events: [],
    diplomacyLogs: {}, // countryId -> [{role, content}]
    advisorLog: [],
    pendingDeployments: [], // {id, from, to, troops, turnQueued}
  };
}

let game = null;

export function getGame() {
  if (!game) game = freshGame();
  return game;
}

export function resetGame() {
  game = freshGame();
  persist();
  return game;
}

export function setPlayerCountry(countryId) {
  const g = getGame();
  if (!g.countries[countryId]) throw new Error(`Unknown country: ${countryId}`);
  g.playerCountry = countryId;
  persist();
  return g;
}

export function getWorldGeoJSON() {
  const raw = fs.readFileSync(path.join(DATA_DIR, "world.min.geojson"), "utf8");
  return JSON.parse(raw);
}

export function addEvent(event) {
  const g = getGame();
  g.events.unshift({ id: g.events.length + 1, turn: g.turn, year: g.year, ...event });
  g.events = g.events.slice(0, 200);
  persist();
}

export function getCountry(id) {
  return getGame().countries[id];
}

export function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SAVE_PATH, JSON.stringify(game));
  } catch (err) {
    console.error("Failed to persist save:", err.message);
  }
}

export function loadPersisted() {
  try {
    if (fs.existsSync(SAVE_PATH)) {
      game = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
      return true;
    }
  } catch (err) {
    console.error("Failed to load save:", err.message);
  }
  return false;
}
