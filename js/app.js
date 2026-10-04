"use strict";
/* ============ NEXUS AI — App principal (v2.0) ============ */
const LS = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch(e){ return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch(e){} }
};
let ttsOn = false, rec = null, recording = false;
let pyodide = null, pyLoading = false;
let advancedMode = true;
let theme = "dark";

/* ============ BOOT ============ */
const bootLines = [
  "▸ inicializando núcleo NEXUS...",
  "▸ carregando sandbox isolado... ok",
  "▸ conectando marketplace de plugins... ok",
  "▸ preparando terminal virtual... ok",
  "▸ verificando agentes e ferramentas... ok",
  "▸ super agente pronto. bem-vindo."
];
let bi = 0;
const bootTimer = setInterval(() => {
  document.getElementById("bootlog").textContent += bootLines[bi] + "\n";
  bi++;
  if (bi >= bootLines.length) {
    clearInterval(bootTimer);
    setTimeout(() => {
      const b = document.getElementById("boot");
      b.style.opacity = 0;
      setTimeout(() => b.remove(), 600);
      bootDone();
    }, 400);
  }
}, 320);

function bootDone(){
  addMsg("bot", "Fala! Eu sou o ✨**NEXUS Super Agent**✨, seu agente de IA que roda direto no navegador.\n\nO que eu já faço agora:\n- **Chat** com vários modelos (OpenRouter, Groq, NVIDIA, Gemini, servidor próprio)\n- **Terminal/Pyodide** com Python de verdade\n- **Navegador** ao vivo com preview de HTML\n- **Voz**: falo e escuto em português\n- **Marketplace** de plugins estilo Acode\n- **Integrações**: WhatsApp, n8n, Supabase, GitHub\n\nDica: clique no 🎤 pra falar, no 🔈 pra eu responder falando, ou digite `/help`.", "núcleo local");
  renderPlugins();
  renderAgentGrid();
  renderModelCatalog();
  renderRightPanel();
  renderProjects();
  renderMemory();
  refreshFiles();
  startGauges();
}

/* ============ NAVEGAÇÃO ============ */
function go(p){
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  const panel = document.getElementById(p + "Panel");
  if (panel) panel.classList.add("active");
  const nb = document.getElementById("nb-" + p);
  if (nb) nb.classList.add("active");
  if (p === "terminal") setTimeout(initTerm, 60);
  if (p === "admin") loadAdmin();
  if (p === "arquivos") refreshFiles();
  if (p === "memoria") renderMemory();
}

/* ============ CHAT ============ */
const chipsData = [
  ["Me apresente seus comandos", "/help"],
  ["Rode Python no terminal", "python print(sum(range(101)))"],
  ["Crie uma landing page", "crie uma landing page NEXUS para eu ver no navegador"],
  ["Testar integração n8n", "/n8n ping"]
];
function renderChips(){
  document.getElementById("chips").innerHTML = chipsData.map(([t, c]) =>
    `<span class="chip" onclick="document.getElementById('chatText').value=${JSON.stringify(c)};sendMsg()">${t}</span>`).join("");
}
function md(text){
  try { return marked.parse(text, { breaks: true }); } catch(e){ return text; }
}
function addMsg(kind, text, who){
  const sc = document.getElementById("chatScroll");
  const d = document.createElement("div");
  d.className = "msg " + kind;
  if (kind === "bot") {
    d.innerHTML = `<div class="who">${who || "NEXUS"} <small>· ${(new Date()).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</small></div>`;
    d.innerHTML += md(text);
  } else {
    d.appendChild(document.createTextNode(text));
  }
  sc.appendChild(d);
  sc.scrollTop = sc.scrollHeight;
  return d;
}
function addTyping(){
  const sc = document.getElementById("chatScroll");
  const d = document.createElement("div");
  d.className = "typing"; d.id = "typing";
  d.innerHTML = "<i></i><i></i><i></i>";
  sc.appendChild(d); sc.scrollTop = sc.scrollHeight;
}
function removeTyping(){ document.getElementById("typing")?.remove(); }

async function sendMsg(){
  const ta = document.getElementById("chatText");
  const text = ta.value.trim();
  if (!text) return;
  ta.value = "";
  addMsg("user", text);
  addTyping();
  try {
    if (text.startsWith("/")) { await handleCommand(text); }
    else { await routeLLM(text); }
  } catch (e) {
    addMsg("bot", "Deu erro aqui: " + e.message, "sistema");
  }
  removeTyping();
}

async function handleCommand(cmd){
  const [c, ...rest] = cmd.slice(1).split(/\s+/);
  const arg = rest.join(" ");
  if (c === "help") {
    addMsg("bot", "**Comandos do agente:**\n`/help` · esta ajuda\n`/python <código>` · roda Python no sandbox\n`/js <código>` · roda JavaScript\n`/n8n <ação>` · dispara fluxo no n8n\n`/wa <mensagem>` · envia pelo WhatsApp Bridge\n`/prompt <tema>` · prompts prontos (copy, codigo, estudo)\n`/browser <url>` · abre no navegador ao vivo\n`/plugin <nome>` · instala plugin\n`/agent <tarefa>` · orquestrador multiagente (backend)\n`/model` · modelo atual e status", "CLI");
    return;
  }
  if (c === "python") { addMsg("bot", "Rodei no sandbox:\n```\n" + await runPython(arg) + "\n```", "python"); return; }
  if (c === "js") { try { addMsg("bot", "→ " + String(eval(arg)), "js sandbox") } catch(e){ addMsg("bot", "Erro: " + e.message, "js sandbox") } return; }
  if (c === "n8n") { addMsg("bot", await callWebhook("k_n8n", {action: arg || "ping", source: "nexus"}), "n8n"); return; }
  if (c === "wa") { addMsg("bot", await callWebhook("k_wa_webhook", {message: arg, source: "nexus", channel: "whatsapp"}), "whatsapp"); return; }
  if (c === "browser") { go("browser"); document.getElementById("urlBar").value = arg.startsWith("http") ? arg : "https://" + arg; navBrowser(); addMsg("bot", "Abri " + arg + " no navegador.", "navegador"); return; }
  if (c === "prompt") { addMsg("bot", promptLibrary(arg), "prompt library"); return; }
  if (c === "model") { addMsg("bot", "Modelo: " + curModel() + "\nChaves: " + (["openrouter","groq","nvidia","gemini"].filter(m => LS.get("k_" + m)).join(", ") || "nenhuma"), "config"); return; }
  if (c === "plugin") { const p = PLUGINS.find(p => p.id === arg || p.name.toLowerCase().includes(arg.toLowerCase())); if (p) { p.installed = true; savePlugs(); renderPlugins(); addMsg("bot", "Plugin instalado: " + p.name, "marketplace"); } else addMsg("bot", "Não achei: " + arg, "marketplace"); return; }
  addMsg("bot", "Comando desconhecido: /" + c + ". Digite /help.", "CLI");
}

function curModel(){
  const sel = document.getElementById("modelSel").value;
  const id = document.getElementById("modelId").value.trim();
  return sel === "demo" ? "modo demo local" : (sel + (id ? " · " + id : ""));
}

/* ---- Roteador multi-modelo ---- */
async function routeLLM(userText){
  const sel = document.getElementById("modelSel").value;
  const key = LS.get("k_" + sel);
  const modelId = document.getElementById("modelId").value.trim();
  const sys = "Você é o NEXUS Super Agent, um agente de IA brasileiro, direto, amigável e profissional. Responda em português do Brasil, no estilo você-e-eu. Se pedirem código, entregue código pronto. Use markdown.";
  const history = LS.get("nexus_history", "[]");
  let hist = [];
  try { hist = JSON.parse(history) } catch(e){}
  try {
    let reply = null;
    if (sel === "demo" || (sel !== "custom" && !key)) {
      reply = demoReply(userText);
      await sleep(600);
    } else if (sel === "gemini") {
      reply = await callGemini(key, modelId || "gemini-2.0-flash", sys, userText, hist);
    } else {
      reply = await callOpenAICompat(sel, key, modelId, sys, userText, hist);
    }
    hist.push({u: userText, a: reply});
    LS.set("nexus_history", JSON.stringify(hist.slice(-30)));
    addMsg("bot", reply, sel === "demo" ? "núcleo local" : sel);
    speak(reply);
  } catch (e) {
    addMsg("bot", "Não consegui falar com o modelo (" + e.message + "). No modo demo eu funciono sem chave: selecione 'Modo Demo' ou configure sua chave em ⚙️.", "sistema");
  }
}

async function callOpenAICompat(sel, key, modelId, sys, userText, hist){
  const urls = {
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    minimax: "https://api.minimax.chat/v1/text/chatcompletion_v2",
    custom: LS.get("k_custom", "")
  };
  const defModels = { openrouter: "google/gemini-2.0-flash-exp:free", nvidia: "meta/llama-3.1-8b-instruct", groq: "llama-3.3-70b-versatile", minimax: "abab6.5s-chat", custom: "gpt-4o-mini" };
  const body = JSON.stringify({
    model: modelId || defModels[sel],
    messages: [{role: "system", content: sys}, ...hist.slice(-6).map(h => ({role: "user", content: h.u})), {role: "user", content: userText}],
    temperature: 0.7, max_tokens: 1024
  });
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + key };
  if (sel === "openrouter") headers["HTTP-Referer"] = location.origin || "https://nexus.ai";
  const r = await fetch(urls[sel], { method: "POST", headers, body });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 120));
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "(resposta vazia)";
}

async function callGemini(key, modelId, sys, userText, hist){
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + (modelId || "gemini-2.0-flash") + ":generateContent?key=" + key;
  const contents = hist.slice(-6).flatMap(h => [{role: "model", parts: [{text: h.a}]}, {role: "user", parts: [{text: h.u}]}]);
  contents.push({role: "user", parts: [{text: userText}]});
  const r = await fetch(url, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ system_instruction: {parts: [{text: sys}]}, contents, generationConfig: {temperature: 0.7, maxOutputTokens: 1024} }) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "(resposta vazia)";
}

function demoReply(t){
  const s = t.toLowerCase();
  if (/land|site|página|pagina/.test(s)) return "Fechado. Cole isto no campo do navegador e clique em **Preview HTML**:\n\n```html\n<h1 style=\"font-family:sans-serif;background:#050508;color:#8b5cf6;padding:60px;text-align:center\">NEXUS</h1>\n<p style=\"text-align:center;color:#10b981\">Seu ecossistema digital, no ar.</p>\n```\n\nSe quiser, eu mando versão completa com botões e animação.";
  if (/python/.test(s)) return "Consigo rodar Python de verdade aqui no sandbox (Pyodide/WebAssembly). Exemplos:\n`/python print(sum(range(101)))`\n`/python import math; print(math.factorial(50))`\nOu abra **Ferramentas → Python**.";
  if (/whats|zap/.test(s)) return "O WhatsApp conecta por bridge: configure o webhook em ⚙️ e use `/wa <mensagem>`.";
  if (/olá|ola|oi|bom dia|boa tarde|boa noite|e a[íi]/.test(s)) return "E aí! Tudo certo por aqui. Posso conversar, programar, rodar Python, abrir sites e automatizar fluxos. Por onde começamos?";
  if (/quem|o que você|voce/.test(s)) return "Sou o **NEXUS Super Agent**: open source, roda 100% no seu navegador, fala e escuta, e tem marketplace de plugins. Multi-modelo: OpenRouter, Groq, NVIDIA, Gemini e qualquer servidor OpenAI-compatível.";
  if (/plug|marketplace|extens/.test(s)) return "O marketplace tem integrações (WhatsApp, n8n, Supabase, GitHub), ferramentas de dev, voz e visual. Abra a aba 🧩 e instale o que quiser.";
  return "Entendi: \"" + t + "\".\nNo modo demo eu respondo localmente sem gastar tokens. Pra conversa completa, coloque uma chave grátis (OpenRouter ou Groq) em ⚙️ e escolha o modelo no topo. Enquanto isso, posso: rodar código (`/python`, `/js`), abrir sites (`/browser`), disparar automações (`/n8n`) e enviar pelo WhatsApp (`/wa`).";
}

function promptLibrary(topic){
  const lib = {
    copy: "**PROMPT DE COPY QUE VENDE**\n\nVocê é um copywriter brasileiro. Escreva [peça] para [produto], público [público]. Estrutura: dor real, agitação honesta, solução, prova social, CTA. Tom: direto, você-e-eu.",
    codigo: "**PROMPT DE CÓDIGO**\n\nVocê é um engenheiro sênior. Tarefa: [objetivo]. Restrições: código completo e rodável, comentários curtos em pt-BR, sem placeholder. Depois do código, liste o que testar.",
    estudo: "**PROMPT DE ESTUDO ACELERADO**\n\nExplique [tema] como se eu fosse iniciante curioso. Depois: 1) analogia, 2) explicação técnica, 3) três exercícios, 4) o que estudar a seguir.",
    "": "Temas: copy, codigo, estudo. Exemplo: `/prompt copy`"
  };
  const s = (topic || "").toLowerCase();
  return lib[s] || lib[s.split(" ")[0]] || lib[""];
}

/* ============ TERMINAL ============ */
let term = null;
const FILES = {
  "bem-vindo.txt": "NEXUS Super Agent © 2026\nTerminal virtual com Python (Pyodide), comandos locais e integrações.\nDigite: help",
  "objetivos.md": "# Objetivos do projeto\n- multi-modelo com chaves grátis\n- marketplace estilo Acode\n- voz em pt-BR\n- integração WhatsApp, n8n, Supabase\n"
};
function initTerm(){
  if (term) { term.focus(); return; }
  term = new Terminal({
    cursorBlink: true, fontSize: 13,
    theme: { background: "#0a0a12", foreground: "#d8dce8", cursor: "#8b5cf6", green: "#10b981" },
    fontFamily: "Consolas, monospace"
  });
  term.open(document.getElementById("term"));
  let buf = "";
  const prompt = () => term.write("\r\n\x1b[38;5;141magent@nexus\x1b[0m:\x1b[38;5;46m~\x1b[0m$ ");
  term.write("\x1b[38;5;141m  NEXUS\x1b[0m terminal · sandbox isolado · digite \x1b[1mhelp\x1b[0m\r\n");
  prompt();
  term.onData(async d => {
    if (d === "\r") {
      term.write("\r\n");
      await runShell(buf.trim());
      buf = ""; prompt();
    } else if (d === "\u007f") {
      if (buf.length) { buf = buf.slice(0, -1); term.write("\b \b"); }
    } else if (d.charCodeAt(0) > 31) { buf += d; term.write(d); }
  });
}
async function runShell(line){
  if (!line) return;
  const [cmd, ...args] = line.split(/\s+/);
  const arg = args.join(" ");
  const w = t => term.write(String(t).replace(/\n/g, "\r\n") + "\r\n");
  try {
    switch (cmd) {
      case "help": w("comandos:\r\n  help / ls / cat <arq> / echo / clear\r\n  python <cod>  Python real (Pyodide)\r\n  js <cod>     JavaScript\r\n  open <url>   navegador ao vivo\r\n  install <p>  instala plugin\r\n  wa <msg>     WhatsApp\r\n  n8n <acao>   automação\r\n  neofetch / date / whoami"); break;
      case "ls": w(Object.keys(FILES).join("   ")); break;
      case "cat": w(FILES[arg] ?? "cat: " + arg + ": não encontrado"); break;
      case "echo": w(arg); break;
      case "date": w(new Date().toLocaleString("pt-BR")); break;
      case "whoami": w("agent — NEXUS Super Agent (sandbox isolado)"); break;
      case "clear": term.clear(); return;
      case "neofetch": w("\x1b[38;5;141m   ◆ NEXUS    \x1b[0m OS: navegador (sandbox)\r\n   ◆ SUPER   Modelo: " + curModel() + "\r\n   ◆ AGENT   Plugins: " + PLUGINS.filter(p=>p.installed).length + "/" + PLUGINS.length + "\r\n            Python: " + (pyodide ? "Pyodide ✓" : "disponível") + "\r\n            Voz: " + (ttsOn ? "fala ✓" : "mudo")); break;
      case "open": go("browser"); document.getElementById("urlBar").value = arg.startsWith("http") ? arg : "https://" + arg; navBrowser(); w("abri " + arg); break;
      case "install": { const p = PLUGINS.find(p => p.id === arg || p.name.toLowerCase().includes((arg||"").toLowerCase())); if (p) { p.installed = true; savePlugs(); renderPlugins(); w("plugin: " + p.name); } else w("install: não encontrado: " + arg); break; }
      case "wa": w(await callWebhook("k_wa_webhook", {message: arg, source: "terminal"})); break;
      case "n8n": w(await callWebhook("k_n8n", {action: arg, source: "terminal"})); break;
      case "python": w("→ " + await runPython(arg)); break;
      case "js": w("→ " + String(eval(arg))); break;
      default: w(cmd + ": não encontrado. digite help");
    }
  } catch (e) { w("erro: " + e.message); }
}
async function runPython(code){
  if (!code) return "uso: python <código>";
  if (!pyodide) {
    if (!pyLoading) {
      pyLoading = true;
      document.getElementById("sbPy").textContent = "carregando Pyodide...";
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      document.head.appendChild(s);
      await new Promise(r => s.onload = r);
      pyodide = await loadPyodide({indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"});
      document.getElementById("sbPy").textContent = "Python 3.12 ✓";
    } else return "Pyodide carregando, tente de novo";
  }
  try {
    pyodide.runPython(`import sys, io\nsys.stdout = io.StringIO()\n`);
    const result = pyodide.runPython(code);
    const out = pyodide.runPython("sys.stdout.getvalue()").trim();
    return [out, (result !== undefined ? String(result) : "")].filter(Boolean).join("\n") || "(sem saída)";
  } catch (e) { return "erro Python: " + e.message; }
}

/* Ferramentas: Python e JS boxes */
async function runPyBox(){
  const code = document.getElementById("pyCode").value;
  document.getElementById("pyOut").textContent = "executando...";
  document.getElementById("pyOut").textContent = await runPython(code);
}
function runJsBox(){
  try {
    const r = eval(document.getElementById("jsCode").value);
    document.getElementById("jsOut").textContent = "→ " + String(r);
  } catch(e){ document.getElementById("jsOut").textContent = "erro: " + e.message; }
}
function runPyTool(){ go("ferramentas"); }
function webSearch(){
  const q = prompt("Buscar na web:");
  if (q) { go("browser"); document.getElementById("urlBar").value = "https://duckduckgo.com/?q=" + encodeURIComponent(q); navBrowser(); }
}

/* ============ NAVEGADOR ============ */
function navBrowser(){
  const u = document.getElementById("urlBar").value.trim();
  if (!u) return;
  if (u.startsWith("<")) { previewHTML(); return; }
  document.getElementById("webFrame").src = u.startsWith("http") ? u : "https://" + u;
}
function previewHTML(){
  const raw = document.getElementById("urlBar").value.trim();
  const html = raw.startsWith("http") ? "<!DOCTYPE html><html><body style='font-family:sans-serif;padding:40px'>Cole HTML direto na barra.</body></html>" : raw;
  document.getElementById("webFrame").srcdoc = html;
}
function openInNewTab(){
  const u = document.getElementById("urlBar").value.trim();
  window.open(u.startsWith("http") ? u : "https://" + u, "_blank");
}

/* ============ PLUGINS ============ */
const PLUGINS = [
  {id:"wa-bridge", icon:"💬", name:"WhatsApp Bridge", cat:"Integração", desc:"Conecta o agente ao WhatsApp via webhook. Envie e receba mensagens com /wa."},
  {id:"n8n-flow", icon:"🔄", name:"n8n Automação", cat:"Automação", desc:"Dispara fluxos do n8n a partir do chat e do terminal."},
  {id:"supabase-mem", icon:"🐘", name:"Memória Supabase", cat:"Integração", desc:"Salva o histórico da conversa no Supabase. Memória entre sessões."},
  {id:"firebase-sync", icon:"🔥", name:"Firebase Sync", cat:"Integração", desc:"Sincronização via Firebase. Multi-dispositivo (roadmap)."},
  {id:"github-int", icon:"🐙", name:"GitHub Integration", cat:"Integração", desc:"Proxy autenticado para a API do GitHub via backend."},
  {id:"opencode", icon:"🤖", name:"OpenCode Agent Loop", cat:"Dev", desc:"Modo agente: planeja, executa e revisa em loop."},
  {id:"py-lab", icon:"🐍", name:"Python Lab", cat:"Dev", desc:"Pyodide completo. Rode análise e scripts sem servidor."},
  {id:"js-runner", icon:"⚡", name:"JS Runner", cat:"Dev", desc:"Executa JavaScript no sandbox com /js."},
  {id:"voice-pro", icon:"🎙️", name:"Voz Pro (pt-BR)", cat:"Voz e Mídia", desc:"Reconhecimento de fala e voz de resposta em português."},
  {id:"vision-cam", icon:"📸", name:"Vision Cam", cat:"Voz e Mídia", desc:"Captura da câmera para modelos com visão (roadmap)."},
  {id:"gold-theme", icon:"🏆", name:"Tema NEXUS", cat:"Visual", desc:"Identidade dark com roxo, azul e verde animado."},
  {id:"matrix", icon:"🌧️", name:"Chuva Matrix", cat:"Visual", desc:"Modo visual inspirado em terminal clássico para o fundo."},
  {id:"prompt-lib", icon:"📚", name:"Prompt Library BR", cat:"Produtividade", desc:"Prompts prontos em português. Use /prompt."},
  {id:"code-mirror", icon:"📝", name:"Code Editor", cat:"Dev", desc:"Editor de arquivos com syntax highlighting (roadmap)."}
];
PLUGINS.forEach(p => p.installed = false);
const DEFAULT_PLUGS = ["py-lab","js-runner","voice-pro","gold-theme","prompt-lib","github-int"];
function savePlugs(){
  LS.set("nexus_plugins", JSON.stringify(PLUGINS.filter(p => p.installed).map(p => p.id)));
  applyPlugins();
}
function applyPlugins(){
  const on = PLUGINS.filter(p => p.installed);
  document.getElementById("sbPlug").textContent = on.length + "/" + PLUGINS.length;
  document.getElementById("plugBadge").textContent = on.length;
  renderRightPanel();
}
let matrixOn = false;
function renderPlugins(){
  const q = (document.getElementById("plugSearch")?.value || "").toLowerCase();
  const c = document.getElementById("plugCat")?.value || "";
  const g = document.getElementById("plugGrid");
  const saved = JSON.parse(LS.get("nexus_plugins", "[]"));
  PLUGINS.forEach(p => p.installed = saved.includes(p.id) || DEFAULT_PLUGS.includes(p.id));
  if (!g) return;
  g.innerHTML = PLUGINS
    .filter(p => (!q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) && (!c || p.cat === c))
    .map(p => `
    <div class="plug ${p.installed ? "installed" : ""}">
      <div class="icon">${p.icon}</div>
      <h3>${p.name}</h3>
      <p>${p.desc}</p>
      <div class="meta"><span class="cat">${p.cat}</span><span class="state">${p.installed ? "● instalado" : "○ disponível"}</span></div>
      <div class="actions">
        <button class="btn sm ${p.installed ? "" : "green"}" onclick="togglePlug('${p.id}')">${p.installed ? "Remover" : "Instalar"}</button>
        <button class="btn sm" onclick="addMsg('user','/plugin ${p.id}');sendMsg()">Testar</button>
      </div>
    </div>`).join("");
  applyPlugins();
}
function togglePlug(id){
  const p = PLUGINS.find(p => p.id === id);
  p.installed = !p.installed;
  savePlugs(); renderPlugins();
}

/* ============ AGENTES (grid) ============ */
const AGENTS_INFO = [
  {id:"main",icon:"🧠",name:"Main Agent",desc:"Orquestrador central. Analisa o pedido e coordena os especialistas."},
  {id:"coding",icon:"⌨️",name:"Coding Agent",desc:"Engenheiro sênior. Código completo e rodável, sem placeholders."},
  {id:"research",icon:"🔎",name:"Research Agent",desc:"Analista de pesquisa. Achados com fontes, fato vs opinião."},
  {id:"browser",icon:"🌐",name:"Browser Agent",desc:"Navegação e extração de conteúdo de páginas web."},
  {id:"terminal",icon:"⌨️",name:"Terminal Agent",desc:"Executa comandos seguros e reporta a saída real."},
  {id:"python",icon:"🐍",name:"Python Agent",desc:"Especialista Python. Valida código com execução real."},
  {id:"debug",icon:"🐞",name:"Debug Agent",desc:"Isola causas de erro e propõe correções testadas."},
  {id:"github",icon:"🐙",name:"GitHub Agent",desc:"Commits, branches, PRs em conventional commits."},
  {id:"automation",icon:"🔄",name:"Automation Agent",desc:"Fluxos com webhooks e n8n. Gatilhos e tratamento de erro."},
  {id:"database",icon:"🗄️",name:"Database Agent",desc:"Modela schemas, queries SQL e migrações."},
  {id:"ui",icon:"🎨",name:"UI Agent",desc:"Front-end moderno, dark e acessível em HTML/CSS/JS."},
  {id:"security",icon:"🛡️",name:"Security Agent",desc:"Aponta riscos reais e correções concretas."},
  {id:"docs",icon:"📄",name:"Docs Agent",desc:"Documentação técnica clara: arquitetura e exemplos."},
  {id:"testing",icon:"🧪",name:"Testing Agent",desc:"Testes que falham antes da correção e passam depois."},
  {id:"deployment",icon:"🚀",name:"Deployment Agent",desc:"Pipeline com build, checagem e rollback."}
];
function renderAgentGrid(){
  document.getElementById("agentGrid").innerHTML = AGENTS_INFO.map(a => `
    <div class="agent-card" onclick="runAgentById('${a.id}')">
      <div class="ah"><div class="ai2">${a.icon}</div><div><div class="an2">${a.name}</div><div class="ar">● pronto</div></div></div>
      <div class="ad2">${a.desc}</div>
    </div>`).join("");
}
function runAgentById(id){
  const a = AGENTS_INFO.find(x => x.id === id);
  go("chat");
  document.getElementById("chatText").value = "/agent " + a.name.toLowerCase() + ": ";
  document.getElementById("chatText").focus();
}
async function runAutoAgent(){
  const task = prompt("Descreva a tarefa para o orquestrador:");
  if (!task) return;
  go("chat");
  document.getElementById("chatText").value = "/agent " + task;
  sendMsg();
}

/* ============ MODELOS (catálogo) ============ */
const MODEL_CATALOG = [
  {id:"openrouter",name:"OpenRouter",free:true,models:["gemini-2.0-flash-exp:free","llama-3.1-8b-instruct:free","mistral-7b-instruct:free","deepseek-r1:free"]},
  {id:"groq",name:"Groq",free:true,models:["llama-3.3-70b-versatile","llama-3.1-8b-instant","qwen3-32b"]},
  {id:"nvidia",name:"NVIDIA NIM",free:false,models:["llama-3.1-8b-instruct","nemotron-70b","qwen2.5-coder-32b"]},
  {id:"gemini",name:"Google Gemini",free:true,models:["gemini-2.0-flash","gemini-2.5-flash","gemini-2.5-pro"]},
  {id:"cerebras",name:"Cerebras",free:true,models:["llama3.1-8b","llama-3.3-70b"]},
  {id:"deepseek",name:"DeepSeek",free:false,models:["deepseek-chat","deepseek-reasoner"]},
  {id:"mistral",name:"Mistral",free:true,models:["mistral-small-latest","codestral-latest"]},
  {id:"minimax",name:"MiniMax",free:false,models:["abab6.5s-chat"]},
  {id:"ollama",name:"Ollama (local)",local:true,models:["qwen2.5-coder:7b","deepseek-coder-v2","llama3.1:8b","gemma2:9b"]}
];
function renderModelCatalog(){
  const el = document.getElementById("modelCatalog");
  if (!el) return;
  el.innerHTML = MODEL_CATALOG.map(p => {
    const hasKey = p.local || LS.get("k_" + p.id) || (p.id === "custom" && LS.get("k_custom"));
    return `<div class="card">
      <h3>${p.local ? "🏠" : (p.free ? "🟢" : "🔵")} ${p.name} <span class="tag ${p.free?"free":p.local?"local":"paid"}" style="margin-left:auto">${p.free?"free":p.local?"local":"pago"}</span>
      <span class="tag ${hasKey?"ok":"no"}">${hasKey?"configurado":"sem chave"}</span></h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
        ${p.models.map(m => `<span class="tag" style="background:var(--card3);color:var(--muted);cursor:pointer" onclick="selectModel('${p.id}','${m}')">${m}</span>`).join("")}
      </div>
    </div>`;
  }).join("");
}
function selectModel(prov, model){
  document.getElementById("modelSel").value = prov;
  document.getElementById("modelId").value = model;
  document.getElementById("sbModel").textContent = prov;
  go("chat");
  addMsg("bot", "Modelo selecionado: **" + prov + " · " + model + "**" + (prov !== "demo" && !LS.get("k_" + prov) && prov !== "ollama" ? "\n⚠️ sem chave configurada — adicione em ⚙️" : ""), "config");
}

/* ============ RIGHT PANEL ============ */
function renderRightPanel(){
  const activeAgents = AGENTS_INFO.slice(0, 5);
  document.getElementById("rpAgents").innerHTML = activeAgents.map((a, i) => `
    <div class="agent-row"><div class="ai">${a.icon}</div><div class="an">${a.name}</div><div class="as ${i===0?"on":"wait"}">${i===0?"Online":"Aguardando"}</div></div>`).join("");
  document.getElementById("rpAgentCt").textContent = activeAgents.length;
  const models = [
    {n:"Qwen2.5-Coder",t:"free"},{n:"DeepSeek R1",t:"free"},{n:"Mistral Large",t:"paid"},
    {n:"Gemini 2.0 Flash",t:"free"},{n:"Llama 3.1 70B",t:"free"}
  ];
  document.getElementById("rpModels").innerHTML = models.map((m, i) => `
    <div class="model-row ${i===0?"sel":""}" onclick="document.getElementById('modelSel').value='openrouter';document.getElementById('modelId').value='${m.n.toLowerCase().replace(/ /g,"-")}'">
      <div class="rb"></div><div class="mn">${m.n}</div><span class="mt ${m.t}">${m.t}</span></div>`).join("");
  const on = PLUGINS.filter(p => p.installed);
  document.getElementById("rpPlugCt").textContent = on.length;
  document.getElementById("rpPlugins").innerHTML = on.slice(0, 6).map(p => `
    <div class="plugin-row"><span class="pi">${p.icon}</span><span class="pn">${p.name}</span><span class="pdot"></span></div>`).join("") || '<div class="hint">nenhum plugin instalado</div>';
}

/* ============ PROJETOS ============ */
function getProjects(){ try { return JSON.parse(LS.get("nexus_projects", "[]")) } catch { return [] } }
function renderProjects(){
  const list = document.getElementById("projList");
  if (!list) return;
  const projs = getProjects();
  if (!projs.length) { list.innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">Nenhum projeto. Clique em "+ Novo projeto".</div>'; return; }
  list.innerHTML = projs.map((p, i) => `
    <div class="card"><h3>📁 ${p.name}</h3><p style="font-size:12px;color:var(--muted);margin-bottom:10px">${p.desc || "sem descrição"}</p>
    <div class="row"><button class="btn sm primary" onclick="openProject(${i})">Abrir</button><button class="btn sm" onclick="delProject(${i})">Excluir</button></div></div>`).join("");
}
function newProject(){
  const name = prompt("Nome do projeto:");
  if (!name) return;
  const desc = prompt("Descrição (opcional):") || "";
  const projs = getProjects();
  projs.push({name, desc, files: {}});
  LS.set("nexus_projects", JSON.stringify(projs));
  renderProjects();
}
function openProject(i){ go("arquivos"); }
function delProject(i){ const p = getProjects(); p.splice(i, 1); LS.set("nexus_projects", JSON.stringify(p)); renderProjects(); }

/* ============ MEMÓRIA ============ */
function renderMemory(){
  const el = document.getElementById("memList");
  if (!el) return;
  let hist = [];
  try { hist = JSON.parse(LS.get("nexus_history", "[]")) } catch {}
  if (!hist.length) { el.innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">Sem histórico ainda. Converse com o agente!</div>'; return; }
  el.innerHTML = hist.map((h, i) => `
    <div class="card"><div style="font-size:11px;color:var(--purple);margin-bottom:6px">Conversa ${i+1}</div>
    <div style="font-size:12px;margin-bottom:6px"><b>Você:</b> ${h.u.slice(0,100)}</div>
    <div style="font-size:12px;color:var(--muted)"><b>NEXUS:</b> ${h.a.slice(0,150)}...</div></div>`).join("");
}
function clearMemory(){ LS.set("nexus_history", "[]"); renderMemory(); addMsg("bot", "Memória limpa.", "sistema"); }

/* ============ ARQUIVOS (VFS via backend) ============ */
async function refreshFiles(){
  const el = document.getElementById("fileList");
  if (!el) return;
  if (window.BK && BK.on) {
    try {
      const r = await bkFetch("/api/files");
      const j = await r.json();
      el.innerHTML = j.files.map(f => `
        <div class="file-row" onclick="document.getElementById('filePath').value='${f.name}';loadFile()">
          <span class="fi">${f.type === "dir" ? "📁" : "📄"}</span><span class="fn">${f.name}</span><span class="fs">${f.size || ""}</span></div>`).join("");
    } catch(e) { el.innerHTML = '<div class="hint" style="padding:12px">erro: ' + e.message + "</div>"; }
  } else {
    el.innerHTML = Object.keys(FILES).map(f => `
      <div class="file-row" onclick="document.getElementById('filePath').value='${f}';document.getElementById('fileContent').value=FILES['${f}']">
        <span class="fi">📄</span><span class="fn">${f}</span></div>`).join("") + '<div class="hint" style="padding:12px">modo local — conecte o backend em ⚙️ para VFS real</div>';
  }
}
async function loadFile(){
  const p = document.getElementById("filePath").value.trim();
  if (!p) return;
  if (window.BK && BK.on) {
    try { const r = await bkFetch("/api/files", {method:"PUT", body:JSON.stringify({path:p})}); const j = await r.json(); document.getElementById("fileContent").value = j.content || ""; }
    catch(e){ document.getElementById("fileContent").value = "erro: " + e.message; }
  } else { document.getElementById("fileContent").value = FILES[p] || "(arquivo não encontrado no modo local)"; }
}
async function saveFile(){
  const p = document.getElementById("filePath").value.trim();
  if (!p) return;
  if (window.BK && BK.on) {
    try { await bkFetch("/api/files", {method:"POST", body:JSON.stringify({path:p, content:document.getElementById("fileContent").value})}); refreshFiles(); alert("Salvo no workspace!"); }
    catch(e){ alert("erro: " + e.message); }
  } else { FILES[p] = document.getElementById("fileContent").value; refreshFiles(); alert("Salvo (local)"); }
}
function newFile(){ document.getElementById("filePath").value = "novo.txt"; document.getElementById("fileContent").value = ""; }

/* ============ GITHUB ============ */
async function saveGithubToken(){
  const tok = document.getElementById("ghToken").value.trim();
  if (!tok) return;
  if (!window.BK || !BK.on) { document.getElementById("ghMsg").innerHTML = '<span class="err-msg">conecte o backend primeiro</span>'; return; }
  try {
    await bkFetch("/api/keys", {method:"PUT", body:JSON.stringify({id:"key_github", value:tok})});
    document.getElementById("ghMsg").innerHTML = '<span class="ok-msg">✓ token salvo no cofre</span>';
  } catch(e){ document.getElementById("ghMsg").innerHTML = '<span class="err-msg">' + e.message + '</span>'; }
}
async function ghRequest(){
  if (!window.BK || !BK.on) { document.getElementById("ghResult").textContent = "conecte o backend primeiro"; return; }
  const path = document.getElementById("ghPath").value.trim() || "/user";
  const method = document.getElementById("ghMethod").value;
  try {
    const r = await bkFetch("/api/integrations/github", {method:"POST", body:JSON.stringify({path, method})});
    const j = await r.json();
    document.getElementById("ghResult").textContent = JSON.stringify(j, null, 2);
  } catch(e){ document.getElementById("ghResult").textContent = "erro: " + e.message; }
}

/* ============ INTEGRAÇÕES ============ */
function saveKeys(){
  ["k_openrouter","k_groq","k_nvidia","k_gemini","k_custom","k_custom_key","k_wa_webhook","k_wa_token","k_n8n","k_supabase","k_supabase_key"].forEach(k => {
    const el = document.getElementById(k);
    if (el) LS.set(k, el.value.trim());
  });
  document.getElementById("keysMsg").innerHTML = '<span class="ok-msg">✓ salvo</span>';
  setTimeout(() => document.getElementById("keysMsg").innerHTML = "", 2500);
  renderModelCatalog();
}
function loadKeys(){
  ["k_openrouter","k_groq","k_nvidia","k_gemini","k_custom","k_custom_key","k_wa_webhook","k_wa_token","k_n8n","k_supabase","k_supabase_key"].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = LS.get(k, "");
  });
}
async function callWebhook(keyId, payload){
  const url = LS.get(keyId, "");
  if (!url) return "⚠️ configure o webhook em ⚙️ primeiro";
  try {
    const headers = {"Content-Type": "application/json"};
    const tok = LS.get("k_wa_token", "");
    if (keyId === "k_wa_webhook" && tok) headers["Authorization"] = "Bearer " + tok;
    const r = await fetch(url, {method: "POST", headers, body: JSON.stringify(payload)});
    return "✓ enviado · HTTP " + r.status;
  } catch (e) { return "⚠️ não consegui alcançar o webhook (CORS ou URL)."; }
}
async function testWA(){
  const m = document.getElementById("waMsg"); m.innerHTML = '<span class="hint">testando...</span>';
  const r = await callWebhook("k_wa_webhook", {test: true, source: "nexus"});
  m.innerHTML = r.startsWith("✓") ? '<span class="ok-msg">' + r + '</span>' : '<span class="err-msg">' + r + '</span>';
}
async function testN8N(){
  const m = document.getElementById("n8nMsg"); m.innerHTML = '<span class="hint">testando...</span>';
  const r = await callWebhook("k_n8n", {test: true, action: "ping"});
  m.innerHTML = r.startsWith("✓") ? '<span class="ok-msg">' + r + '</span>' : '<span class="err-msg">' + r + '</span>';
}

/* ============ VOZ ============ */
function speak(text){
  if (!ttsOn || !window.speechSynthesis) return;
  const clean = text.replace(/[*_`#>/]|```.*?```/gs, "").slice(0, 500);
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "pt-BR";
  const v = speechSynthesis.getVoices().find(v => v.lang.startsWith("pt"));
  if (v) u.voice = v;
  u.rate = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function toggleTTS(){
  ttsOn = !ttsOn;
  document.getElementById("ttsBtn").textContent = ttsOn ? "🔊" : "🔈";
  document.getElementById("ttsBtn").classList.toggle("rec", ttsOn);
  if (ttsOn) speak("Voz ativada. Agora eu falo com você.");
}
function toggleMic(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById("micBtn");
  if (!SR) { addMsg("bot", "Seu navegador não tem reconhecimento de voz. Use Chrome ou Edge.", "sistema"); return; }
  if (recording) { rec.stop(); return; }
  rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = false;
  rec.onstart = () => { recording = true; btn.classList.add("rec"); };
  rec.onend = () => { recording = false; btn.classList.remove("rec"); };
  rec.onerror = e => { addMsg("bot", "Não consegui ouvir: " + e.error, "voz"); };
  rec.onresult = e => { document.getElementById("chatText").value = e.results[0][0].transcript; sendMsg(); };
  rec.start();
}

/* ============ THEME / VISUAL ============ */
function setAccent(c){ document.documentElement.style.setProperty("--accent", c); LS.set("nexus_accent", c); }
function toggleTheme(){ /* dark-only por enquanto, placeholder */ addMsg("bot", "Tema dark NEXUS ativo. Use ⚙️ → Aparência para mudar a cor de destaque.", "tema"); }
function toggleAdvanced(){
  advancedMode = !advancedMode;
  document.getElementById("advToggle").classList.toggle("on", advancedMode);
}
function bbInsert(txt){
  const bb = document.getElementById("bbInput");
  bb.value += txt;
  bb.focus();
}
function handleFile(e){
  const f = e.target.files[0];
  if (!f) return;
  addMsg("bot", "📎 Arquivo anexado: **" + f.name + "** (" + (f.size/1024).toFixed(1) + " KB). No modo browser não envio ao servidor; conecte o backend para upload real.", "anexo");
}

/* Canvas partículas */
const canvas = document.createElement("canvas");
canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
document.getElementById("particles").appendChild(canvas);
const ctx = canvas.getContext("2d");
let dots = [];
function resizeCv(){ canvas.width = innerWidth; canvas.height = innerHeight; }
resizeCv(); addEventListener("resize", resizeCv);
for (let i = 0; i < 60; i++) dots.push({x: Math.random()*innerWidth, y: Math.random()*innerHeight, vx: (Math.random()-.5)*.3, vy: (Math.random()-.5)*.3, r: Math.random()*1.6+.4});
function drawCv(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  dots.forEach(d => {
    d.x += d.vx; d.y += d.vy;
    if (d.x < 0 || d.x > canvas.width) d.vx *= -1;
    if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7);
    ctx.fillStyle = matrixOn ? "rgba(16,185,129,.6)" : "rgba(139,92,246,.5)"; ctx.fill();
  });
  for (let i = 0; i < dots.length; i++) for (let j = i+1; j < dots.length; j++) {
    const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y, dist = dx*dx + dy*dy;
    if (dist < 12000) { ctx.strokeStyle = (matrixOn ? "rgba(16,185,129," : "rgba(139,92,246,") + (0.1*(1-dist/12000)) + ")"; ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke(); }
  }
  requestAnimationFrame(drawCv);
}
drawCv();

/* Gauges (simulados, atualizam periodicamente) */
function startGauges(){
  function upd(){
    const cpu = 8 + Math.floor(Math.random() * 20);
    const ram = 25 + Math.floor(Math.random() * 25);
    const disk = 24 + Math.floor(Math.random() * 12);
    document.getElementById("gCpu").textContent = cpu + "%"; document.getElementById("gCpuF").style.width = cpu + "%";
    document.getElementById("gRam").textContent = ram + "%"; document.getElementById("gRamF").style.width = ram + "%";
    document.getElementById("gDisk").textContent = disk + "%"; document.getElementById("gDiskF").style.width = disk + "%";
  }
  upd(); setInterval(upd, 4000);
}

/* Clock */
function tickClock(){
  const n = new Date();
  document.getElementById("sbClock").textContent = n.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
  document.getElementById("sbDate").textContent = n.toLocaleDateString("pt-BR", {weekday:"short", day:"2-digit", month:"short"});
}
setInterval(tickClock, 1000); tickClock();

/* Listeners */
document.getElementById("modelSel").addEventListener("change", () => {
  document.getElementById("sbModel").textContent = document.getElementById("modelSel").value;
  const defIds = {openrouter: "google/gemini-2.0-flash-exp:free", nvidia: "meta/llama-3.1-8b-instruct", groq: "llama-3.3-70b-versatile", gemini: "gemini-2.0-flash", minimax: "abab6.5s-chat", custom: "", demo: ""};
  document.getElementById("modelId").value = defIds[document.getElementById("modelSel").value] || "";
});
document.getElementById("chatText").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Init */
loadKeys();
renderChips();
const savedAccent = LS.get("nexus_accent");
if (savedAccent) setAccent(savedAccent);
