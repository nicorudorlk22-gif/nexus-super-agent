"use strict";
/* ===== MODO BACKEND — NEXUS AI Backend v1.5+ =====
   Backend conectado: chat com streaming SSE, terminal com comandos reais,
   /agent ativa o orquestrador multiagente, VFS e GitHub via API. */
const BK = {
  url: LS.get("bk_url", ""), token: LS.get("bk_token", ""), on: false, models: null
};

function bkFetch(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (BK.token) headers["x-nexus-token"] = BK.token;
  return fetch(BK.url.replace(/\/$/, "") + path, Object.assign({}, opts, { headers }));
}

async function bkConnect(verbose) {
  if (!BK.url) { if (verbose) alert("Informe a URL do backend"); return false; }
  try {
    const r = await bkFetch("/api/status");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    BK.on = true;
    document.getElementById("bkStatus").innerHTML = '<span class="ok-msg">✓ conectado · v' + (j.version || "?") + " · " + j.providersConfigured + " provedor(es)</span>";
    document.getElementById("termMode").innerHTML = '<span class="status-dot" style="display:inline-block"></span>backend real';
    bkLoadModels();
    if (document.getElementById("bkUrl")) document.getElementById("bkUrl").value = BK.url;
    return true;
  } catch (e) {
    BK.on = false;
    document.getElementById("bkStatus").innerHTML = '<span class="err-msg">sem conexão: ' + e.message + " (modo local)</span>";
    return false;
  }
}

async function bkLoadModels() {
  try {
    const r = await bkFetch("/api/models");
    const j = await r.json();
    BK.models = j.catalog;
    const sel = document.getElementById("modelSel");
    const keep = sel.value;
    sel.innerHTML = '<option value="demo">🧪 Modo Demo (sem chave)</option>';
    BK.models.forEach(p => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = (p.local ? "🏠 " : (p.hasKey ? "🔑 " : "○ ")) + p.name + (p.hasKey ? "" : " (sem chave)");
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
  } catch (e) { console.warn("catálogo indisponível", e); }
}

/* Chat via backend com streaming SSE */
async function bkChat(userText) {
  const sel = document.getElementById("modelSel").value;
  const model = document.getElementById("modelId").value.trim();
  const el = addMsg("bot", "", sel + (model ? " · " + model : "") + " · backend");
  const tn = document.createTextNode("");
  el.appendChild(tn);
  const r = await bkFetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ provider: sel, model, messages: [{ role: "user", content: userText }], stream: true })
  });
  if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const j = JSON.parse(line.slice(5).trim());
        if (j.delta) { full += j.delta; el.lastChild.remove(); el.insertAdjacentHTML("beforeend", md(full)); document.getElementById("chatScroll").scrollTop = 1e9; }
        if (j.error) throw new Error(j.error);
      } catch (e) { if (e.message && !e.message.includes("JSON")) throw e; }
    }
  }
  if (!full.trim()) throw new Error("resposta vazia do backend");
  speak(full);
}

/* Override do roteador de chat: backend primeiro, fallback local */
const _origRouteLLM = routeLLM;
routeLLM = async function (userText) {
  if (userText.startsWith("/agent ")) {
    const task = userText.slice(7).trim();
    if (!task) return addMsg("bot", "Uso: /agent <tarefa>.", "CLI");
    if (!BK.on) return addMsg("bot", "O modo agente precisa do backend conectado. Configure em ⚙️ → Backend.", "sistema");
    const t = addMsg("bot", "Executando tarefa com o agente especialista...", "orquestrador");
    try {
      const r = await bkFetch("/api/agents/run", { method: "POST", body: JSON.stringify({ task, agent: "auto" }) });
      const j = await r.json();
      t.remove();
      if (j.text) { addMsg("bot", j.text, j.agentName || j.agent); speak(j.text); }
      if (j.toolRuns && j.toolRuns.length) addMsg("bot", "Ferramentas usadas:\n" + j.toolRuns.map(x => "• " + x.tool + (x.ok ? " ✓" : " ✗")).join("\n"), "ferramentas");
    } catch (e) { t.remove(); addMsg("bot", "Erro no agente: " + e.message, "sistema"); }
    return;
  }
  if (BK.on) {
    try { await bkChat(userText); return; }
    catch (e) { addMsg("bot", "Backend falhou (" + e.message + "), respondendo local.", "fallback"); }
  }
  return _origRouteLLM(userText);
};

/* Override do terminal: comandos reais no backend */
const _runShell = runShell;
runShell = async function (line) {
  if (!line) return;
  const [cmd] = line.split(/\s+/);
  if (["help", "clear", "neofetch"].includes(cmd)) return _runShell(line);
  if (BK.on) {
    const w = t => term.write(String(t).replace(/\n/g, "\r\n") + "\r\n");
    try {
      const r = await bkFetch("/api/terminal/exec", { method: "POST", body: JSON.stringify({ cmd: line, timeoutSec: 20 }) });
      const j = await r.json();
      if (j.stdout) w(j.stdout);
      if (j.stderr) w("\x1b[31m" + j.stderr + "\x1b[0m");
      if (j.error) w("\x1b[31m" + j.error + "\x1b[0m");
      if (!j.stdout && !j.stderr && !j.error) w("(sem saída · código " + j.code + ")");
      if (j.timedOut) w("\x1b[31m⏱ tempo limite (20s)\x1b[0m");
    } catch (e) { w("\x1b[31mbackend: " + e.message + "\x1b[0m"); }
    return;
  }
  return _runShell(line);
};

function bkSave() {
  BK.url = document.getElementById("bkUrl").value.trim();
  BK.token = document.getElementById("bkToken").value.trim();
  LS.set("bk_url", BK.url); LS.set("bk_token", BK.token);
  bkConnect(true).then(ok => { if (ok) { addMsg("bot", "Backend conectado. Terminal com comandos reais, chat com streaming e /agent ativo.", "backend"); refreshFiles(); } });
}

/* ============ ADMIN ============ */
async function loadAdmin(){
  if (!BK.on) {
    document.getElementById("adminStats").innerHTML = '<div class="hint" style="grid-column:1/-1">Conecte o backend em ⚙️ para ver dados administrativos.</div>';
    document.getElementById("auditList").innerHTML = '<div class="hint">conecte o backend</div>';
    return;
  }
  try {
    const [sr, mr, ar] = await Promise.all([bkFetch("/api/status"), bkFetch("/api/keys"), bkFetch("/api/audit")]);
    const s = await sr.json(), k = await mr.json(), a = await ar.json();
    document.getElementById("adminStats").innerHTML = `
      <div class="stat-box"><div class="sv">${s.version || "?"}</div><div class="sl">Versão do backend</div></div>
      <div class="stat-box"><div class="sv">${s.providersConfigured}</div><div class="sl">Provedores com chave</div></div>
      <div class="stat-box"><div class="sv">${s.workspaceFiles}</div><div class="sl">Arquivos no workspace</div></div>
      <div class="stat-box"><div class="sv">${Math.floor(s.uptimeSec/60)}m</div><div class="sl">Uptime</div></div>
      <div class="stat-box"><div class="sv">${s.authMode}</div><div class="sl">Modo de auth</div></div>
      <div class="stat-box"><div class="sv">${(k.keys||[]).length}</div><div class="sl">Chaves no cofre</div></div>`;
    document.getElementById("vaultList").innerHTML = (k.keys||[]).map(key => `<span class="tag" style="background:var(--card3);color:var(--green);margin:2px">${key}</span>`).join("") || '<span class="hint">cofre vazio</span>';
    document.getElementById("auditList").innerHTML = (a.log||[]).slice(-30).reverse().map(x => `
      <div class="audit-row"><span class="at">${x.t?.slice(11,19) || ""}</span><span class="aa">${x.action}</span><span class="ad">${x.detail}</span></div>`).join("") || '<div class="hint">sem registros</div>';
  } catch(e){
    document.getElementById("adminStats").innerHTML = '<div class="err-msg">erro: ' + e.message + '</div>';
  }
}
async function vaultAdd(){
  if (!BK.on) return alert("Conecte o backend");
  const id = document.getElementById("vaultKeyId").value.trim();
  const val = document.getElementById("vaultKeyVal").value.trim();
  if (!id || !val) return;
  try { await bkFetch("/api/keys", {method:"PUT", body:JSON.stringify({id, value:val})}); document.getElementById("vaultKeyVal").value=""; loadAdmin(); }
  catch(e){ alert("erro: " + e.message); }
}
async function vaultList(){ loadAdmin(); }
async function apiTest(){
  if (!BK.on) { document.getElementById("apiTestOut").textContent = "conecte o backend"; return; }
  const cmd = document.getElementById("apiTestCmd").value.trim();
  const [m, ...p] = cmd.split(/\s+/);
  const path = p.join(" ");
  try {
    const r = await bkFetch(path, {method: m});
    const txt = await r.text();
    document.getElementById("apiTestOut").textContent = txt.slice(0, 5000);
  } catch(e){ document.getElementById("apiTestOut").textContent = "erro: " + e.message; }
}

/* Auto-conectar ao carregar */
if (BK.url) bkConnect(false);
