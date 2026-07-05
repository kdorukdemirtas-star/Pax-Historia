import { chat, chatJSON } from "./ollama.js";
import { getGame, addEvent } from "./gameState.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function dateLabel(game) {
  const monthIdx = game.turn % 12;
  const year = game.startYear + Math.floor(game.turn / 12);
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

function worldSummary(game, focusIds = []) {
  const player = game.countries[game.playerCountry];
  const focus = focusIds.map((id) => game.countries[id]).filter(Boolean);
  const list = focus.length ? focus : Object.values(game.countries).slice(0, 0);
  return {
    date: dateLabel(game),
    player: player && {
      id: player.id,
      name: player.name,
      stats: player.stats,
      treasury: player.treasury,
      troops: player.troops,
    },
    countries: list.map((c) => ({
      id: c.id,
      name: c.name,
      owner: game.countries[c.owner]?.name ?? c.owner,
      stats: c.stats,
      treasury: c.treasury,
      troops: c.troops,
      relationToPlayer: c.relations?.[game.playerCountry] ?? 0,
    })),
  };
}

/**
 * Advances the world by one turn: resolves pending troop movements,
 * drifts stats a little, and asks the local Ollama model to narrate 1-3
 * world events shaped by the player's recent actions.
 */
export async function advanceTurn() {
  const game = getGame();
  game.turn += 1;
  game.year = game.startYear + Math.floor(game.turn / 12);

  resolveDeployments(game);
  driftStats(game);

  const player = game.countries[game.playerCountry];
  const neighborIds = player ? player.borders : [];
  const summary = worldSummary(game, [game.playerCountry, ...neighborIds].filter(Boolean));

  const prompt = [
    {
      role: "system",
      content:
        "You are the world simulation engine for a geopolitical strategy game called Open Historia, " +
        "similar to Pax Historia. You narrate short, punchy world events (news-ticker style) that react to " +
        "the state of the world and the player's nation. Always respond with strict JSON only: " +
        '{"events": [{"headline": string, "body": string, "countryId": string|null, "severity": "low"|"medium"|"high"}]}. ' +
        "Produce between 1 and 3 events. Keep each body under 40 words. Do not include markdown.",
    },
    {
      role: "user",
      content: `Current date: ${summary.date}.\nWorld state (player + neighboring countries):\n${JSON.stringify(
        summary
      )}\nGenerate this turn's world events.`,
    },
  ];

  let events = [];
  try {
    const parsed = await chatJSON(prompt, { temperature: 0.9 });
    if (parsed && Array.isArray(parsed.events)) events = parsed.events;
  } catch (err) {
    events = [
      {
        headline: "The world holds its breath",
        body: `AI narration unavailable (${err.message}). Time passes quietly this turn.`,
        countryId: null,
        severity: "low",
      },
    ];
  }

  for (const e of events) {
    addEvent({
      headline: e.headline || "Unnamed event",
      body: e.body || "",
      countryId: e.countryId || null,
      severity: e.severity || "low",
    });
    applyEventEffects(game, e);
  }

  return { turn: game.turn, year: game.year, date: dateLabel(game), events };
}

function applyEventEffects(game, event) {
  const target = event.countryId && game.countries[event.countryId];
  if (!target) return;
  const delta = event.severity === "high" ? 6 : event.severity === "medium" ? 3 : 1;
  const sign = /crisis|unrest|war|collapse|disaster|attack|revolt/i.test(event.headline + event.body)
    ? -1
    : 1;
  target.stats.stability = clamp(target.stats.stability + sign * delta * -0.5 + (sign > 0 ? delta : -delta));
}

function driftStats(game) {
  for (const c of Object.values(game.countries)) {
    c.stats.economy = clamp(c.stats.economy + (Math.random() * 2 - 1));
    c.stats.stability = clamp(c.stats.stability + (Math.random() * 1.4 - 0.7));
    c.treasury = Math.max(0, Math.round(c.treasury * (1 + (c.stats.economy - 50) / 2000)));
  }
}

function resolveDeployments(game) {
  const stillPending = [];
  for (const dep of game.pendingDeployments) {
    if (dep.turnQueued >= game.turn) {
      stillPending.push(dep);
      continue;
    }
    const from = game.countries[dep.from];
    const to = game.countries[dep.to];
    if (!from || !to) continue;

    if (from.owner === to.owner) {
      // Friendly repositioning.
      to.troops += dep.troops;
      from.troops = Math.max(0, from.troops - dep.troops);
      addEvent({
        headline: `Troops reposition to ${to.name}`,
        body: `${dep.troops.toLocaleString()} troops from ${from.name} redeployed to ${to.name}.`,
        countryId: to.id,
        severity: "low",
      });
      continue;
    }

    // Hostile engagement: simple strength-based resolution with randomness.
    const attackPower = dep.troops * (0.8 + Math.random() * 0.4) * (1 + from.stats.military / 200);
    const defensePower = to.troops * (0.9 + Math.random() * 0.4) * (1 + to.stats.military / 200);
    const attackerWins = attackPower > defensePower;

    const attackerLosses = Math.round(dep.troops * (attackerWins ? 0.15 : 0.45));
    const defenderLosses = Math.round(to.troops * (attackerWins ? 0.35 : 0.1));
    from.troops = Math.max(0, from.troops - attackerLosses);
    to.troops = Math.max(0, to.troops - defenderLosses);

    if (attackerWins) {
      to.owner = from.owner;
      to.stats.stability = clamp(to.stats.stability - 20);
      to.troops += Math.round(dep.troops - attackerLosses) * 0.5;
    }

    addEvent({
      headline: attackerWins
        ? `${from.name} forces seize ${to.name}`
        : `${from.name}'s offensive against ${to.name} repelled`,
      body: `${dep.troops.toLocaleString()} troops engaged near ${to.name}. Attacker losses: ${attackerLosses.toLocaleString()}, defender losses: ${defenderLosses.toLocaleString()}.`,
      countryId: to.id,
      severity: "high",
    });
  }
  game.pendingDeployments = stillPending;
}

export function queueDeployment({ from, to, troops }) {
  const game = getGame();
  const fromCountry = game.countries[from];
  if (!fromCountry) throw new Error(`Unknown origin country: ${from}`);
  if (!game.countries[to]) throw new Error(`Unknown destination country: ${to}`);
  if (!fromCountry.borders.includes(to) && fromCountry.owner !== game.countries[to].owner) {
    throw new Error(`${to} does not border ${from}`);
  }
  const amount = Math.min(Math.max(0, Math.round(troops)), fromCountry.troops);
  if (amount <= 0) throw new Error("Not enough troops available to deploy.");

  const dep = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    to,
    troops: amount,
    turnQueued: game.turn,
  };
  game.pendingDeployments.push(dep);
  addEvent({
    headline: `Deployment ordered toward ${game.countries[to].name}`,
    body: `${game.countries[from].name} mobilizes ${amount.toLocaleString()} troops toward ${game.countries[to].name}. Resolves next turn.`,
    countryId: to,
    severity: "medium",
  });
  return dep;
}

/**
 * Diplomacy chat: the player talks to an AI-controlled nation.
 */
export async function diplomacyChat(countryId, playerMessage) {
  const game = getGame();
  const country = game.countries[countryId];
  if (!country) throw new Error(`Unknown country: ${countryId}`);
  const player = game.countries[game.playerCountry];

  game.diplomacyLogs[countryId] = game.diplomacyLogs[countryId] || [];
  const history = game.diplomacyLogs[countryId];

  const relation = country.relations?.[game.playerCountry] ?? 0;

  const systemPrompt = {
    role: "system",
    content:
      `You are the head of state of ${country.name}, an AI-controlled nation in a geopolitical strategy game. ` +
      `Stay strictly in character. Your nation's stats: economy ${country.stats.economy}/100, military ${country.stats.military}/100, ` +
      `stability ${country.stats.stability}/100, diplomacy ${country.stats.diplomacy}/100. Treasury ${country.treasury}, troops ${country.troops}. ` +
      `Your current relation toward the player's nation (${player?.name ?? "the player"}) is ${relation} (-100 hostile to +100 allied). ` +
      "Respond concisely and diplomatically-in-character (2-5 sentences), in plain text (no JSON, no markdown). " +
      "You may propose or accept trade deals, alliances, non-aggression pacts, or reject demands, staying consistent with your interests and relation score.",
  };

  const messages = [
    systemPrompt,
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: playerMessage },
  ];

  const reply = await chat(messages, { temperature: 0.85 });

  history.push({ role: "user", content: playerMessage });
  history.push({ role: "assistant", content: reply });
  game.diplomacyLogs[countryId] = history.slice(-40);

  // Nudge relation slightly based on simple sentiment heuristics.
  const positive = /agree|accept|welcome|friend|ally|deal|peace|thank/i.test(reply);
  const negative = /reject|refuse|threat|hostile|war|never|demand/i.test(reply);
  country.relations = country.relations || {};
  country.relations[game.playerCountry] = clamp(
    relation + (positive ? 3 : 0) - (negative ? 3 : 0),
    -100,
    100
  );

  return { reply, relation: country.relations[game.playerCountry] };
}

/**
 * Advisor chat: the player's own strategic AI advisor.
 */
export async function advisorChat(playerMessage) {
  const game = getGame();
  const player = game.countries[game.playerCountry];
  if (!player) throw new Error("Select a country to play as first.");

  const neighbors = player.borders.map((id) => game.countries[id]).filter(Boolean);

  const systemPrompt = {
    role: "system",
    content:
      "You are the strategic advisor to the head of state of the player's nation in a geopolitical strategy game. " +
      "Give clear, actionable, concise advice (bulleted where useful) about economy, military, and diplomacy. " +
      "Plain text only, no markdown headers, no JSON.",
  };

  const context = {
    role: "user",
    content: `Situation report for ${player.name}: ${JSON.stringify({
      stats: player.stats,
      treasury: player.treasury,
      troops: player.troops,
      neighbors: neighbors.map((n) => ({
        name: n.name,
        stats: n.stats,
        relation: n.relations?.[player.id] ?? 0,
      })),
    })}\n\nAdvisor question: ${playerMessage}`,
  };

  game.advisorLog.push({ role: "user", content: playerMessage });
  const messages = [systemPrompt, ...game.advisorLog.slice(-20).map((m) => ({ role: m.role, content: m.content })), context];
  const reply = await chat(messages, { temperature: 0.7 });
  game.advisorLog.push({ role: "assistant", content: reply });
  game.advisorLog = game.advisorLog.slice(-40);
  return { reply };
}

export function dateLabelForGame() {
  return dateLabel(getGame());
}
