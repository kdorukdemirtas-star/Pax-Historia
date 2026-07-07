import { useEffect, useMemo, useState } from "react";
import WorldMap from "./WorldMap";
import ChatPanel from "./ChatPanel";
import { api } from "./api";
import "./App.css";

function StatBar({ label, value }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <div className="stat-bar">
        <div className="stat-bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="stat-value">{Math.round(value)}</span>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [world, setWorld] = useState(null);
  const [game, setGame] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");

  const [diplomacyOpen, setDiplomacyOpen] = useState(false);
  const [diplomacyLog, setDiplomacyLog] = useState([]);
  const [diplomacySending, setDiplomacySending] = useState(false);

  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorLog, setAdvisorLog] = useState([]);
  const [advisorSending, setAdvisorSending] = useState(false);

  const [deployTarget, setDeployTarget] = useState("");
  const [deployAmount, setDeployAmount] = useState(1000);

  async function refreshGame() {
    const data = await api.getGame();
    setGame(data);
    if (!data.playerCountry) setPickerOpen(true);
  }

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus({ ok: false }));
    api.getWorld().then(setWorld).catch((e) => setError(e.message));
    refreshGame().catch((e) => setError(e.message));
  }, []);

  const selectedCountry = selectedId && game ? game.countries[selectedId] : null;
  const player = game?.playerCountry ? game.countries[game.playerCountry] : null;

  const sortedCountries = useMemo(() => {
    if (!game) return [];
    return Object.values(game.countries).sort((a, b) => a.name.localeCompare(b.name));
  }, [game]);

  const filteredCountries = useMemo(
    () => sortedCountries.filter((c) => c.name.toLowerCase().includes(pickerFilter.toLowerCase())),
    [sortedCountries, pickerFilter]
  );

  async function handleSelectPlayerCountry(id) {
    try {
      await api.selectCountry(id);
      setPickerOpen(false);
      await refreshGame();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleAdvanceTurn() {
    setAdvancing(true);
    setError(null);
    try {
      await api.advanceTurn();
      await refreshGame();
    } catch (e) {
      setError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  async function openDiplomacy(id) {
    setSelectedId(id);
    setDiplomacyOpen(true);
    try {
      const { log } = await api.diplomacyLog(id);
      setDiplomacyLog(log);
    } catch {
      setDiplomacyLog([]);
    }
  }

  async function sendDiplomacyMessage(text) {
    if (!selectedId) return;
    setDiplomacyLog((l) => [...l, { role: "user", content: text }]);
    setDiplomacySending(true);
    try {
      const { reply } = await api.diplomacyChat(selectedId, text);
      setDiplomacyLog((l) => [...l, { role: "assistant", content: reply }]);
      await refreshGame();
    } catch (e) {
      setDiplomacyLog((l) => [...l, { role: "assistant", content: `[error: ${e.message}]` }]);
    } finally {
      setDiplomacySending(false);
    }
  }

  async function openAdvisor() {
    setAdvisorOpen(true);
    try {
      const { log } = await api.advisorLog();
      setAdvisorLog(log);
    } catch {
      setAdvisorLog([]);
    }
  }

  async function sendAdvisorMessage(text) {
    setAdvisorLog((l) => [...l, { role: "user", content: text }]);
    setAdvisorSending(true);
    try {
      const { reply } = await api.advisorChat(text);
      setAdvisorLog((l) => [...l, { role: "assistant", content: reply }]);
    } catch (e) {
      setAdvisorLog((l) => [...l, { role: "assistant", content: `[error: ${e.message}]` }]);
    } finally {
      setAdvisorSending(false);
    }
  }

  async function handleDeploy() {
    if (!player || !selectedCountry || !deployTarget) return;
    try {
      await api.deployTroops(player.id, deployTarget, Number(deployAmount));
      await refreshGame();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🌍 Open Historia <span className="brand-sub">(local, Ollama-powered)</span></div>
        <div className="topbar-mid">
          {game && (
            <>
              <span className="date-pill">{game.date}</span>
              <button className="btn btn-primary" onClick={handleAdvanceTurn} disabled={advancing}>
                {advancing ? "Simulating…" : "Advance Turn"}
              </button>
            </>
          )}
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={openAdvisor}>🧭 Advisor</button>
          <button className="btn" onClick={() => setPickerOpen(true)}>Change Nation</button>
          <span className={`ollama-pill ${status?.ollama?.ok ? "ok" : "bad"}`}>
            {status?.ollama?.ok ? `Ollama: ${status.ollama.model}` : "Ollama offline"}
          </span>
        </div>
      </header>

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error} (click to dismiss)
        </div>
      )}

      <main className="main">
        <WorldMap
          world={world}
          countries={game?.countries}
          playerCountry={game?.playerCountry}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <aside className="sidebar">
          {player && (
            <section className="panel">
              <h3>Your Nation: {player.name}</h3>
              <StatBar label="Economy" value={player.stats.economy} />
              <StatBar label="Military" value={player.stats.military} />
              <StatBar label="Stability" value={player.stats.stability} />
              <StatBar label="Diplomacy" value={player.stats.diplomacy} />
              <div className="kv-row"><span>Treasury</span><span>${player.treasury.toLocaleString()}</span></div>
              <div className="kv-row"><span>Troops</span><span>{player.troops.toLocaleString()}</span></div>
            </section>
          )}

          {selectedCountry && (
            <section className="panel">
              <h3>{selectedCountry.name}</h3>
              <div className="kv-row"><span>Owner</span><span>{game.countries[selectedCountry.owner]?.name}</span></div>
              <StatBar label="Economy" value={selectedCountry.stats.economy} />
              <StatBar label="Military" value={selectedCountry.stats.military} />
              <StatBar label="Stability" value={selectedCountry.stats.stability} />
              <div className="kv-row">
                <span>Relation to you</span>
                <span>{selectedCountry.relations?.[game.playerCountry] ?? 0}</span>
              </div>

              {selectedCountry.owner !== player?.owner && (
                <button className="btn btn-block" onClick={() => openDiplomacy(selectedCountry.id)}>
                  💬 Negotiate
                </button>
              )}

              {player && player.borders.includes(selectedCountry.id) && (
                <div className="deploy-box">
                  <label>Deploy troops here</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={deployAmount}
                    onChange={(e) => setDeployAmount(e.target.value)}
                  />
                  <button
                    className="btn btn-block"
                    onClick={() => {
                      setDeployTarget(selectedCountry.id);
                      handleDeploy();
                    }}
                  >
                    🪖 Deploy
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="panel events-panel">
            <h3>World Events</h3>
            <div className="events-list">
              {game?.events?.length ? (
                game.events.map((e) => (
                  <div key={e.id} className={`event-item severity-${e.severity}`}>
                    <div className="event-headline">{e.headline}</div>
                    <div className="event-body">{e.body}</div>
                    <div className="event-meta">{e.year}</div>
                  </div>
                ))
              ) : (
                <div className="chat-empty">No events yet. Advance the turn to begin.</div>
              )}
            </div>
          </section>
        </aside>
      </main>

      {diplomacyOpen && selectedCountry && (
        <div className="modal-overlay" onClick={() => setDiplomacyOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ChatPanel
              title={`Diplomacy: ${selectedCountry.name}`}
              subtitle={`Relation: ${selectedCountry.relations?.[game.playerCountry] ?? 0}`}
              messages={diplomacyLog}
              onSend={sendDiplomacyMessage}
              onClose={() => setDiplomacyOpen(false)}
              sending={diplomacySending}
              placeholder={`Message the leader of ${selectedCountry.name}…`}
            />
          </div>
        </div>
      )}

      {advisorOpen && (
        <div className="modal-overlay" onClick={() => setAdvisorOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ChatPanel
              title="Strategic Advisor"
              subtitle={player ? `Advising ${player.name}` : undefined}
              messages={advisorLog}
              onSend={sendAdvisorMessage}
              onClose={() => setAdvisorOpen(false)}
              sending={advisorSending}
              placeholder="Ask your advisor for guidance…"
            />
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="modal-overlay">
          <div className="modal picker-modal">
            <h2>Choose your nation</h2>
            <input
              className="picker-search"
              placeholder="Search countries…"
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              autoFocus
            />
            <div className="picker-list">
              {filteredCountries.map((c) => (
                <button key={c.id} className="picker-item" onClick={() => handleSelectPlayerCountry(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            {game?.playerCountry && (
              <button className="btn" onClick={() => setPickerOpen(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
