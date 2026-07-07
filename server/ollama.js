// Thin wrapper around a local Ollama server. No cloud API keys involved —
// everything talks to http://localhost:11434 (or OLLAMA_HOST) by default.

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";

/**
 * Ask Ollama to produce a chat completion.
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {{ json?: boolean, temperature?: number }} [options]
 * @returns {Promise<string>} the raw text content of the reply
 */
export async function chat(messages, options = {}) {
  const body = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.8,
    },
  };
  if (options.json) body.format = "json";

  let res;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new OllamaUnavailableError(
      `Could not reach Ollama at ${OLLAMA_HOST}. Is "ollama serve" running? (${err.message})`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OllamaUnavailableError(
      `Ollama responded with ${res.status} ${res.statusText}: ${text.slice(0, 300)}`
    );
  }

  const data = await res.json();
  return data?.message?.content ?? "";
}

/**
 * Same as chat(), but attempts to parse the reply as JSON, stripping any
 * accidental markdown code fences the model might add.
 */
export async function chatJSON(messages, options = {}) {
  const raw = await chat(messages, { ...options, json: true });
  return parseLooseJSON(raw);
}

export function parseLooseJSON(raw) {
  if (!raw) return null;
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  try {
    if (start !== -1 && end !== -1 && (arrStart === -1 || start < arrStart)) {
      return JSON.parse(text.slice(start, end + 1));
    }
    if (arrStart !== -1 && arrEnd !== -1) {
      return JSON.parse(text.slice(arrStart, arrEnd + 1));
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class OllamaUnavailableError extends Error {}

export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return { ok: false, model: OLLAMA_MODEL, host: OLLAMA_HOST };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return {
      ok: true,
      model: OLLAMA_MODEL,
      host: OLLAMA_HOST,
      hasModel: models.some((m) => m === OLLAMA_MODEL || m.startsWith(`${OLLAMA_MODEL}:`)),
      models,
    };
  } catch {
    return { ok: false, model: OLLAMA_MODEL, host: OLLAMA_HOST };
  }
}

export const config = { OLLAMA_HOST, OLLAMA_MODEL };
