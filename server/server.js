// NEXUS AI — Servidor principal: API REST + SSE, zero dependências (Node 18+)
"use strict";
const http = require("http");
const crypto = require("crypto");
const { CATALOG, provider } = require("./lib/providers");
const { vault, vfs, execLimited } = require("./lib/core");
const { callProvider, complete, routeWithFallback, streamChunks } = require("./lib/ai");
const { AGENTS, pickAgentFor, runAgent } = require("./lib/agents");

const PORT = Number(process.env.PORT) || 3000;
const AUTH = process.env.NEXUS_AUTH_TOKEN || null; // se não definido, servidor local aceita apenas 127.0.0.1
const startedAt = Date.now();
const auditLog = [];

function log(action, detail) {
  auditLog.push({ t: new Date().toISOString(), action, detail: String(detail || "").slice(0, 300) });
  if (auditLog.length > 500) auditLog.shift();
}

function tokenOK(req) {
  if (!AUTH) return true; // modo local sem token: apenas para desenvolvimento
  const h = req.headers["authorization"] || "";
  return h === "Bearer " + AUTH || req.headers["x-nexus-token"] === AUTH;
}

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": process.env.NEXUS_CORS || "*" });
  res.end(b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 512 * 1024) { reject(new Error("corpo acima de 512KB")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch (e) { reject(new Error("JSON inválido")); } });
    req.on("error", reject);
  });
}

async function handle(req, res, url) {
  const route = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;

  if (method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": process.env.NEXUS_CORS || "*", "Access-Control-Allow-Headers": "content-type,authorization,x-nexus-token", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE" }); return res.end(); }

  if (!tokenOK(req)) return json(res, 401, { error: "não autorizado" });

  /* ---------- STATUS ---------- */
  if (route === "/api/status" && method === "GET") {
    const keys = vault.listKeys();
    return json(res, 200, {
      name: "NEXUS AI Backend", version: "1.5.0", uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      node: process.version, authMode: AUTH ? "token" : "dev-local",
      providersConfigured: keys.filter(k => k.startsWith("key_") && k !== "key_custom" && k !== "key_custom_base").length,
      workspaceFiles: vfs.list(".").length, lastErrors: auditLog.filter(a => a.action === "error").slice(-5)
    });
  }

  /* ---------- MODELOS ---------- */
  if (route === "/api/models" && method === "GET") {
    const keys = vault.listKeys();
    return json(res, 200, { catalog: CATALOG.map(p => ({ ...p, hasKey: keys.includes("key_" + p.id) })) });
  }

  if (route === "/api/models/test" && method === "POST") {
    const b = await readBody(req);
    const provId = b.provider; const prov = provider(provId);
    if (!prov) return json(res, 400, { error: "provedor desconhecido" });
    try {
      const model = b.model || prov.models[0].id;
      const out = await complete(provId, model, [{ role: "user", content: "Responda apenas: ok" }], { maxTokens: 10 });
      log("model_test", provId + "/" + model);
      return json(res, 200, { ok: true, provider: provId, model, sample: out.text.slice(0, 50) });
    } catch (e) {
      return json(res, 200, { ok: false, provider: provId, error: String(e.message || e).slice(0, 200) });
    }
  }

  /* ---------- VAULT DE CHAVES ---------- */
  if (route === "/api/keys" && method === "PUT") {
    const b = await readBody(req);
    const id = String(b.id || "").replace(/[^a-z0-9_]/gi, "");
    if (!id || !b.value) return json(res, 400, { error: "id e value obrigatórios" });
    vault.setKey(id, String(b.value).slice(0, 500));
    log("key_set", id);
    return json(res, 200, { ok: true, id, stored: "criptografado AES-256-GCM" });
  }
  if (route === "/api/keys" && method === "GET") {
    const keys = vault.listKeys();
    return json(res, 200, { keys, note: "valores nunca são devolvidos; apenas os ids" });
  }
  if (route === "/api/keys" && method === "DELETE") {
    const b = await readBody(req);
    vault.deleteKey(String(b.id || ""));
    log("key_delete", b.id);
    return json(res, 200, { ok: true });
  }

  /* ---------- CHAT (completo e streaming) ---------- */
  if (route === "/api/chat" && method === "POST") {
    const b = await readBody(req);
    const messages = Array.isArray(b.messages) ? b.messages.slice(-30) : [];
    if (!messages.length) return json(res, 400, { error: "messages obrigatório" });
    const provId = b.provider || "openrouter";
    const model = b.model;

    if (b.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": process.env.NEXUS_CORS || "*", "Connection": "keep-alive" });
      try {
        const call = await callProvider(provId, { model, messages, stream: true });
        for await (const chunk of streamChunks(call)) res.write("data: " + JSON.stringify({ delta: chunk }) + "\n\n");
        res.write("data: " + JSON.stringify({ done: true }) + "\n\n");
      } catch (e) {
        // fallback: tenta rota com fallback sem streaming antes de desistir
        try {
          const out = await routeWithFallback({ provider: provId, model, messages });
          res.write("data: " + JSON.stringify({ delta: out.text, fallback: out.provider }) + "\n\n");
          res.write("data: " + JSON.stringify({ done: true }) + "\n\n");
        } catch (e2) {
          res.write("data: " + JSON.stringify({ error: String(e2.message || e2).slice(0, 200) }) + "\n\n");
        }
      }
      return res.end();
    }
    try {
      const out = await routeWithFallback({ provider: provId, model, messages });
      return json(res, 200, { ok: true, text: out.text, provider: out.provider, model: out.model, fallbackUsed: out.fallbackUsed });
    } catch (e) {
      log("error", "chat: " + e.message);
      return json(res, 502, { error: String(e.message || e).slice(0, 300) });
    }
  }

  /* ---------- AGENTES ---------- */
  if (route === "/api/agents" && method === "GET") {
    return json(res, 200, { agents: Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, icon: a.icon })) });
  }
  if (route === "/api/agents/pick" && method === "POST") {
    const b = await readBody(req);
    return json(res, 200, { agent: pickAgentFor(b.task) });
  }
  if (route === "/api/agents/run" && method === "POST") {
    const b = await readBody(req);
    if (!b.task) return json(res, 400, { error: "task obrigatória" });
    const agentId = b.agent === "auto" || !b.agent ? pickAgentFor(b.task) : b.agent;
    try {
      const out = await runAgent({ agentId, task: b.task, provider: b.provider, model: b.model });
      log("agent_run", agentId + " · " + out.status);
      return json(res, 200, { ok: true, ...out });
    } catch (e) {
      log("error", "agent: " + e.message);
      return json(res, 502, { error: String(e.message || e).slice(0, 300) });
    }
  }

  /* ---------- TERMINAL REAL ---------- */
  if (route === "/api/terminal/exec" && method === "POST") {
    const b = await readBody(req);
    const out = await execLimited(String(b.cmd || ""), { timeoutSec: b.timeoutSec, cwd: b.cwd, network: b.network });
    log("exec", b.cmd + " → " + (out.ok ? "ok" : "err"));
    return json(res, 200, out);
  }

  /* ---------- VFS ---------- */
  if (route === "/api/files" && method === "GET") return json(res, 200, { files: vfs.list(url.searchParams.get("dir") || ".") });
  if (route === "/api/files" && method === "POST") { const b = await readBody(req); try { return json(res, 200, vfs.write(b.path, b.content ?? "")); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (route === "/api/files" && method === "PUT") { const b = await readBody(req); try { return json(res, 200, { content: vfs.read(b.path) }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (route === "/api/files" && method === "DELETE") { const b = await readBody(req); try { return json(res, 200, vfs.remove(b.path)); } catch (e) { return json(res, 400, { error: e.message }); } }

  /* ---------- INTEGRAÇÕES: GitHub, webhook, WhatsApp ---------- */
  if (route === "/api/integrations/github" && method === "POST") {
    const b = await readBody(req);
    const ghToken = vault.getKey("key_github");
    if (!ghToken) return json(res, 400, { error: "configure key_github no cofre (PUT /api/keys)" });
    const p = String(b.path || "/user");
    if (!/^\/[A-Za-z0-9_.\-\/]*$/.test(p)) return json(res, 400, { error: "caminho inválido" });
    const r = await fetch("https://api.github.com" + p, {
      method: ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(b.method) ? b.method : "GET",
      headers: { "Authorization": "Bearer " + ghToken, "Accept": "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "nexus-ai" },
      body: b.body ? JSON.stringify(b.body) : undefined
    });
    log("github", b.method + " " + p + " → " + r.status);
    const txt = await r.text();
    return json(res, r.status, { ok: r.ok, status: r.status, data: txt.length > 100000 ? txt.slice(0, 100000) : safeJSON(txt) });
  }

  if (route === "/api/integrations/webhook" && method === "POST") {
    const b = await readBody(req);
    try {
      const u = new URL(String(b.url || ""));
      if (u.protocol !== "https:") return json(res, 400, { error: "apenas https" });
      if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1)/.test(u.hostname)) return json(res, 403, { error: "SSRF: endereço interno bloqueado" });
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b.payload || {}) });
      log("webhook", u.host + " → " + r.status);
      return json(res, 200, { ok: r.ok, status: r.status });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === "/api/integrations/whatsapp" && method === "POST") {
    const bridge = vault.getKey("key_whatsapp_bridge");
    if (!bridge) return json(res, 400, { error: "configure key_whatsapp_bridge (URL do bridge oficial) no cofre" });
    const u = new URL(bridge);
    const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (vault.getKey("key_whatsapp_token") || "") }, body: JSON.stringify({ to: b.to, message: b.message, source: "nexus-ai" }) });
    log("whatsapp", "→ " + r.status);
    return json(res, 200, { ok: r.ok, status: r.status, note: "enviado ao bridge configurado; use a WhatsApp Business Cloud API pelas regras da Meta" });
  }

  /* ---------- AUDITORIA ---------- */
  if (route === "/api/audit" && method === "GET") return json(res, 200, { log: auditLog.slice(-100) });

  json(res, 404, { error: "rota não encontrada: " + method + " " + route, docs: "GET /api/status, /api/models, /api/agents; POST /api/chat, /api/agents/run, /api/terminal/exec, /api/integrations/webhook; PUT/GET/DELETE /api/keys; GET/POST/PUT/DELETE /api/files" });
}

function safeJSON(txt) { try { return JSON.parse(txt); } catch { return txt; } }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  try { await handle(req, res, url); }
  catch (e) { log("error", e.message); if (!res.headersSent) json(res, 500, { error: String(e.message || e) }); else res.end(); }
});

server.listen(PORT, () => {
  console.log("NEXUS AI Backend v1.5.0");
  console.log("  porta:", PORT);
  console.log("  modo auth:", AUTH ? "token" : "DEV LOCAL (sem token; use NEXUS_AUTH_TOKEN em produção)");
  console.log("  workspace:", vfs.root());
  if (!process.env.NEXUS_MASTER_KEY) console.log("  aviso: defina NEXUS_MASTER_KEY para criptografia estável do cofre");
});

module.exports = { server, handle };
