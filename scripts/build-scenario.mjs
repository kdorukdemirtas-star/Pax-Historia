// Builds server/data/world.min.geojson and server/data/scenario.json from the raw
// Natural Earth countries file. Run with: node scripts/build-scenario.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bbox from "@turf/bbox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "server", "data");

const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "world.geojson"), "utf8"));

// Keep only the properties we actually need, and skip Antarctica.
const features = raw.features
  .filter((f) => f.properties.ISO_A3 !== "ATA" && f.properties.ADMIN !== "Antarctica")
  .map((f, idx) => {
    const p = f.properties;
    const id = (p.ISO_A3 && p.ISO_A3 !== "-99" ? p.ISO_A3 : p.ADM0_A3) || `ID${idx}`;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        id,
        name: p.NAME || p.ADMIN,
        continent: p.CONTINENT,
        pop_est: p.POP_EST || 0,
        gdp_est: p.GDP_MD || 0,
      },
    };
  });

const minGeo = { type: "FeatureCollection", features };
fs.writeFileSync(path.join(DATA_DIR, "world.min.geojson"), JSON.stringify(minGeo));
console.log(`Wrote world.min.geojson with ${features.length} countries`);

// Compute border adjacency by buffering each polygon slightly and checking intersection.
console.log("Computing adjacency (this may take a moment)...");

// Split each country into its individual polygon "parts" (a MultiPolygon of a
// country with overseas territories becomes several separate parts), each
// with its own small bbox. This avoids the classic bug where a country like
// France or the USA gets a single giant/antimeridian-spanning bbox that
// falsely "touches" everything on the other side of the world.
const DEG_PAD = 0.35; // ~35km buffer in degrees, generous enough for narrow straits

function polygonParts(feature) {
  const geom = feature.geometry;
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  return polys.map((coords) => {
    const part = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: coords } };
    const [minX, minY, maxX, maxY] = bbox(part);
    return { part, box: [minX - DEG_PAD, minY - DEG_PAD, maxX + DEG_PAD, maxY + DEG_PAD] };
  });
}

const partsByCountry = features.map((f) => polygonParts(f));

function boxesOverlap(a, b) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

const adjacency = {};
for (const f of features) adjacency[f.properties.id] = new Set();

for (let i = 0; i < features.length; i++) {
  for (let j = i + 1; j < features.length; j++) {
    const idA = features[i].properties.id;
    const idB = features[j].properties.id;
    let touching = false;
    outer: for (const { box: boxA } of partsByCountry[i]) {
      for (const { box: boxB } of partsByCountry[j]) {
        if (boxesOverlap(boxA, boxB)) {
          touching = true;
          break outer;
        }
      }
    }
    if (touching) {
      adjacency[idA].add(idB);
      adjacency[idB].add(idA);
    }
  }
}

// Seed pseudo-random stats deterministically from country id so re-runs are stable.
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

const countries = {};
for (const f of features) {
  const { id, name, continent, pop_est, gdp_est } = f.properties;
  const rand = seededRandom(id);
  const popScore = Math.min(100, Math.log10(Math.max(pop_est, 1e5)) * 12 - 50);
  const gdpScore = Math.min(100, Math.log10(Math.max(gdp_est, 1)) * 12 - 20);

  countries[id] = {
    id,
    name,
    continent,
    owner: id, // every country starts independent, owned by itself
    population: Math.round(pop_est) || 1000000,
    gdp: Math.round(gdp_est) || 1000,
    stats: {
      economy: Math.max(5, Math.min(95, Math.round(gdpScore + rand() * 10))),
      military: Math.max(5, Math.min(95, Math.round(30 + rand() * 40))),
      stability: Math.max(5, Math.min(95, Math.round(50 + rand() * 30))),
      diplomacy: Math.max(5, Math.min(95, Math.round(50 + rand() * 30))),
    },
    treasury: Math.round(1000 + (popScore + gdpScore) * 50),
    troops: Math.round(10000 + (popScore + gdpScore) * 500),
    borders: Array.from(adjacency[id]),
    relations: {}, // filled in lazily at runtime, keyed by other country id -> -100..100
  };
}

const scenario = {
  id: "modern-day",
  name: "Modern Day",
  description:
    "A present-day scenario spanning every recognized nation. Pick a country, manage its economy, military and diplomacy, and let a local AI drive world events, rival nations and your advisor.",
  startYear: 2026,
  turnLengthLabel: "month",
  countries,
};

fs.writeFileSync(path.join(DATA_DIR, "scenario.json"), JSON.stringify(scenario, null, 2));
console.log(`Wrote scenario.json with ${Object.keys(countries).length} countries`);
