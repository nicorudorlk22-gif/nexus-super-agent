// NEXUS AI — Orquestrador multiagente com loop de ferramentas real
// Agentes especializados + delegação. O loop executa ferramentas de verdade
// (exec, VFS, webhook) e alimenta o resultado de volta ao modelo.
"use strict";
const { routeWithFallback } = require("./ai");
const { vault, vfs, execLimited } = require("./core");

const AGENTS = {
  main:        { name: "Main Agent",  icon: "🧠", system: "Você é o orquestrador central NEXUS. Analise o pedido, escolha o melhor caminho e coordene. Responda em português, direto e objetivo." },
  coding:      { name: "Coding Agent", icon: "⌨️", system: "Você é um engenheiro de software sênior. Escreva código completo e rodável, comentários curtos em pt-BR, sem placeholders. Se usar ferramenta, execute de fato." },
  research:    { name: "Research Agent", icon: "🔎", system: "Você é um analista de pesquisa. Estruture achados com fontes, distinga fato de opinião e resuma em português." },
  browser:     { name: "Browser Agent", icon: "🌐", system: "Você é um agente de navegação. Descreva passos claros para inspecionar e extrair conteúdo de páginas web." },
  terminal:    { name: "Terminal Agent", icon: "⌨️", system: "Você é um agente de terminal. Use a ferramenta exec para rodar comandos seguros e reporte a saída real." },
  python:      { name: "Python Agent", icon: "🐍", system: "Você é um especialista em Python. Use a ferramenta exec para executar python3 quando precisar validar código." },
  debug:       { name: "Debug Agent", icon: "🐞", system: "Você é um especialista em depuração. Peça o erro, isole a causa, proponha e teste a correção." },
  github:      { name: "GitHub Agent", icon: "🐙", system: "Você é um agente de Git. Explique passos precisos de commits, branches e PRs; sugira mensagens em conventional commits." },
  automation:  { name: "Automation Agent", icon: "🔄", system: "Você é um agente de automação. Projete fluxos (webhooks, n8n) com gatilhos, passos e tratamento de erro." },
  database:    { name: "Database Agent", icon: "🗄️", system: "Você é um especialista em dados. Modele schemas, queries SQL e migrações com cuidado." },
  ui:          { name: "UI Agent", icon: "🎨", system: "Você é um designer de front-end. Entregue UI em HTML/CSS/JS moderno, dark e acessível." },
  security:    { name: "Security Agent", icon: "🛡️", system: "Você é um auditor de segurança. Aponte riscos reais (injeção, exposição de segredos, SSRF) e correções concretas." },
  docs:        { name: "Documentation Agent", icon: "📄", system: "Você é um redator técnico. Documente com clareza: arquitetura, uso e exemplos." },
  testing:     { name: "Testing Agent", icon: "🧪", system: "Você é um engenheiro de QA. Escreva testes que falhem antes da correção e passem depois." },
  deployment:  { name: "Deployment Agent", icon: "🚀", system: "Você é um especialista em deploy. Proponha pipeline com build, checagem e rollback." }
};

function pickAgentFor(task) {
  const t = (task || "").toLowerCase();
  const map = [
    [/bug|erro|exception|não funciona|falha|traceback/, "debug"],
    [/deploy|publicar|vercel|netlify|docker/, "deployment"],
    [/segurança|seguranca|vulnerab|injection|senha|token|key/, "security"],
    [/banco|sql|database|postgres|mongo|schema/, "database"],
    [/design|interface|tela|landing|frontend|css/, "ui"],
    [/git|commit|pull request|branch|repositório|repositorio/, "github"],
    [/automat|webhook|n8n|cron|agend/, "automation"],
    [/pesquis|analis|comparar|mercado|notíc|notic/, "research"],
    [/test|qa|cobertura/, "testing"],
    [/python|pandas|script py/, "python"],
    [/código|codigo|função|funcao|api|app|componente/, "coding"],
    [/terminal|comando|bash|shell/, "terminal"]
  ];
  for (const [rx, a] of map) if (rx.test(t)) return a;
  return "main";
}

/* Ferramentas disponíveis ao loop do agente (execução REAL, com limites do core.js) */
async function runTool(name, input) {
  switch (name) {
    case "exec":
      return await execLimited(String(input.cmd || input), { timeoutSec: Number(input.timeoutSec) || 15 });
    case "write_file":
      return vfs.write(String(input.path), String(input.content ?? ""));
    case "read_file":
      return { content: vfs.read(String(input.path)) };
    case "list_dir":
      return { files: vfs.list(String(input.path || ".")) };
    case "webhook": {
      const url = String(input.url || "");
      const u = new URL(url);
      if (u.protocol !== "https:") return { ok: false, error: "apenas https" };
      if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(u.hostname)) return { ok: false, error: "endereço interno bloqueado" };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.payload || {}) });
      return { ok: r.ok, status: r.status };
    }
    default:
      return { error: "ferramenta desconhecida: " + name };
  }
}

/* Loop do agente: modelo responde, pode chamar ferramenta, resultado volta pro modelo.
   Máximo de MAX_STEPS rodadas de ferramenta. Sem chave configurada, devolve orientação honesta. */
async function runAgent({ agentId = "main", task, provider: provId = "openrouter", model, steps = [], maxSteps = 4 }) {
  const agent = AGENTS[agentId] || AGENTS.main;
  if (vault.listKeys().filter(k => k.startsWith("key_")).length === 0 && provId !== "ollama") {
    return {
      agent: agentId, text:
        "Nenhum provedor de IA configurado no cofre do backend ainda.\n" +
        "Configure uma chave em PUT /api/keys (por exemplo OpenRouter, que tem modelos gratuitos) ou rode Ollama local e use o provedor 'ollama'.\n" +
        "Enquanto isso posso indicar o plano: " + task,
      toolRuns: [], status: "no_provider"
    };
  }
  const conversation = [
    { role: "system", content: agent.system + "\n\nVocê tem ferramentas. Para usar uma, responda APENAS com JSON: {\"tool\": \"exec|write_file|read_file|list_dir|webhook\", \"input\": {...}}. Sem ferramenta, responda direto ao usuário em português." },
    { role: "user", content: String(task) }
  ];
  const toolRuns = [];
  for (let i = 0; i <= maxSteps; i++) {
    const out = await routeWithFallback({ provider: provId, model, messages: conversation });
    const txt = out.text.trim();
    const isTool = txt.startsWith("{") && txt.endsWith("}");
    if (!isTool) return { agent: agentId, agentName: agent.name, text: txt, toolRuns, provider: out.provider, model: out.model, fallbackUsed: out.fallbackUsed, status: "done" };
    let parsed;
    try { parsed = JSON.parse(txt); } catch {
      return { agent: agentId, text: txt, toolRuns, status: "done" };
    }
    const result = await runTool(parsed.tool, parsed.input || {});
    toolRuns.push({ tool: parsed.tool, ok: result.ok !== false && !result.error, summary: JSON.stringify(result).slice(0, 200) });
    conversation.push({ role: "assistant", content: txt });
    conversation.push({ role: "user", content: "Resultado da ferramenta " + parsed.tool + ":\n" + JSON.stringify(result).slice(0, 3000) + "\n\nContinue. Se já resolveu, responda ao usuário sem JSON." });
  }
  return { agent: agentId, text: "Parei no limite de passos de ferramenta. Últimas execuções:\n" + JSON.stringify(toolRuns, null, 2), toolRuns, status: "max_steps" };
}

module.exports = { AGENTS, pickAgentFor, runAgent, runTool };
