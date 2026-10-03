// NEXUS AI — Roteador multimodelo: fallback automático + streaming SSE
"use strict";
const { provider } = require("./providers");
const { vault } = require("./core");

/* Monta a chamada conforme o "kind" do provedor e devolve um fetch pronto.
   streaming: quando true, devolve a Response bruta p/ o server extrair chunks. */
async function callProvider(provId, { model, messages, temperature = 0.7, maxTokens = 1024, stream = false }) {
  const prov = provider(provId);
  if (!prov) throw new Error("provedor desconhecido: " + provId);
  const key = vault.getKey("key_" + provId);
  if (!key && !prov.local) throw { code: "NO_KEY", provider: provId, message: "sem chave para " + prov.name };

  if (prov.kind === "gemini") {
    const url = prov.baseUrl + "/models/" + model + ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(key);
    const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const sys = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys }] } : undefined,
        contents: contents.filter(c => c.role !== "user" || true), generationConfig: { temperature, maxOutputTokens: maxTokens } })
    });
    if (!r.ok) throw { code: "HTTP_" + r.status, provider: provId, message: (await r.text()).slice(0, 200) };
    return { type: "gemini", response: r };
  }

  if (prov.kind === "anthropic") {
    const r = await fetch(prov.baseUrl + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system: messages.find(m => m.role === "system")?.content, messages: messages.filter(m => m.role !== "system") })
    });
    if (!r.ok) throw { code: "HTTP_" + r.status, provider: provId, message: (await r.text()).slice(0, 200) };
    return { type: "anthropic", response: r };
  }

  // OpenAI-compatível (openrouter, nvidia, groq, cerebras, deepseek, mistral, together, fireworks, openai, hf, minimax, ollama, custom)
  const base = provId === "custom" ? (vault.getKey("key_custom_base") || "https://api.openai.com/v1") : prov.baseUrl;
  const apiKey = vault.getKey("key_custom") || key || "ollama";
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream })
  });
  if (!r.ok) throw { code: "HTTP_" + r.status, provider: provId, message: (await r.text()).slice(0, 200) };
  return { type: "openai", response: r };
}

/* Extrai texto completo (modo não-streaming) */
async function complete(provId, model, messages, opts = {}) {
  const res = await callProvider(provId, { model, messages, stream: false, ...opts });
  const j = await res.response.json();
  if (res.type === "openai") return { text: j.choices?.[0]?.message?.content ?? "", provider: provId };
  if (res.type === "anthropic") return { text: j.content?.[0]?.text ?? "", provider: provId };
  return { text: j.content?.[0]?.text ?? "", provider: provId };
}

/* Roteador com fallback: tenta [provId, ...fallbackProviders] em ordem */
const SANE_FALLBACK = ["openrouter", "groq", "gemini", "mistral", "ollama"];

async function routeWithFallback({ provider: provId, model, messages, fallback = SANE_FALLBACK }) {
  const chain = [provId, ...fallback.filter(p => p !== provId)];
  const errors = [];
  for (const p of chain) {
    try {
      const prov = provider(p);
      const models = prov?.models ?? [];
      const chosen = p === provId ? model : (models.find(m => m.tag === "free" || m.tag === "local")?.id || models[0]?.id);
      if (!chosen) continue;
      const out = await complete(p, chosen, messages);
      if (out.text) return { ...out, model: chosen, fallbackUsed: p !== provId };
    } catch (e) { errors.push(String(e.message || e)); }
  }
  throw new Error("todos os provedores falharam: " + errors.join(" | ").slice(0, 300));
}

/* Iterador de streaming SSE unificado (openai e gemini) */
async function* streamChunks(callResult) {
  const { type, response } = callResult;
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload);
        if (type === "openai") {
          const t = j.choices?.[0]?.delta?.content;
          if (t) yield t;
        } else if (type === "gemini") {
          const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
          if (t) yield t;
        }
      } catch { /* chunk parcial: ignora */ }
    }
  }
}

module.exports = { callProvider, complete, routeWithFallback, streamChunks };
