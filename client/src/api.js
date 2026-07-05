const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  status: () => request("/status"),
  getGame: () => request("/game"),
  getWorld: () => request("/world.geojson"),
  resetGame: () => request("/game/reset", { method: "POST" }),
  selectCountry: (countryId) =>
    request("/game/select-country", { method: "POST", body: JSON.stringify({ countryId }) }),
  advanceTurn: () => request("/turn/advance", { method: "POST" }),
  deployTroops: (from, to, troops) =>
    request("/troops/deploy", { method: "POST", body: JSON.stringify({ from, to, troops }) }),
  diplomacyLog: (countryId) => request(`/diplomacy/${countryId}/log`),
  diplomacyChat: (countryId, message) =>
    request(`/diplomacy/${countryId}/chat`, { method: "POST", body: JSON.stringify({ message }) }),
  advisorLog: () => request("/advisor/log"),
  advisorChat: (message) => request("/advisor/chat", { method: "POST", body: JSON.stringify({ message }) }),
};
