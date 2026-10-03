# NEXUS Super Agent

Super agente de IA **open source** que roda 100% no navegador. Chat multi-modelo, terminal próprio com Python real, navegador ao vivo, voz em português e marketplace de plugins estilo Acode.

> Preto, dourado e verde. O estilo NEXUS.

## Recursos

- **Chat multi-modelo**: NVIDIA NIM, MiniMax, Google Gemini, OpenRouter (modelos `:free`) e qualquer servidor OpenAI-compatível. Sem chave? Modo demo local funciona de graça.
- **Terminal próprio**: terminal virtual (xterm.js) com shell próprio, arquivos locais e comandos reais.
- **Python de verdade**: Pyodide (Python 3.12 em WebAssembly) no terminal e no chat (`/python`).
- **Navegador ao vivo**: iframe sandbox com preview de HTML e navegação.
- **Voz**: fala (SpeechSynthesis) e escuta (SpeechRecognition) em pt-BR.
- **Marketplace de plugins**: instale e combine extensões, tudo salvo no seu navegador.
- **Integrações**: WhatsApp Bridge, n8n, Supabase, Firebase, GitHub e Base44 via webhooks.
- **Sandbox isolado**: código roda confinado, sem tocar no seu sistema.
- **Zero back-end**: abra o `index.html` e está no ar. Chaves ficam no `localStorage`, nunca em servidor.

## Como usar

1. Abra o [site](https://nicorudorlk22-gif.github.io/nexus-super-agent/) (ou o `index.html` localmente).
2. (Opcional) Pegue uma chave grátis no [OpenRouter](https://openrouter.ai) ou no [Google AI Studio](https://aistudio.google.com) e salve em ⚙️.
3. Escolha o modelo no topo e converse. Digite `/help` para os comandos.

### Comandos

| Comando | O que faz |
|---|---|
| `/python <código>` | Roda Python real no sandbox |
| `/js <código>` | Roda JavaScript |
| `/browser <url>` | Abre no navegador ao vivo |
| `/n8n <ação>` | Dispara fluxo de automação |
| `/wa <mensagem>` | Envia pelo WhatsApp Bridge |
| `/prompt <tema>` | Prompts prontos (copy, codigo, estudo) |
| `/plugin <nome>` | Instala plugin |

## Arquitetura: as 30 tecnologias

### 10 tecnologias avançadas
1. **Pyodide** (CPython em WebAssembly) para Python no navegador
2. **xterm.js** para terminal virtual
3. **Web Speech API** (voz bidirecional pt-BR)
4. **Sandbox de iframe** isolado para o navegador interno
5. **Canvas API** com animação de partículas em tempo real
6. **localStorage** para chaves, plugins e histórico
7. **Carregamento lazy** do Pyodide (só quando você usa Python)
8. **Roteador multi-modelo** (adapters OpenAI-compatível + Gemini)
9. **Shell virtual** com sistema de arquivos em memória
10. **PWA-ready** (roadmap: manifest + service worker para instalação offline)

### 10 que fazem a diferença
1. **Marketplace de plugins** estilo Acode (registro local, extensível)
2. **WhatsApp Bridge** via webhook (funciona com Base44 Superagent e n8n)
3. **Integração n8n** para automação de vendas e marketing
4. **Memória Supabase** (histórico persistente entre sessões)
5. **Firebase Sync** para multi-dispositivo (roadmap v1.1)
6. **Biblioteca de prompts em português** embutida
7. **Loop de agente OpenCode** (planeja, executa, revisa; roadmap v1.1)
8. **Servidor OpenAI-compatível próprio** como modelo
9. **Voice Cam / Vision** (roadmap v1.1: captura de imagem para modelos com visão)
10. **Identidade NEXUS**: tema animado, boot cinematográfico, status bar ao vivo

### 10 open source no ecossistema
1. [Pyodide](https://github.com/pyodide/pyodide) (MPL-2.0)
2. [xterm.js](https://github.com/xtermjs/xterm.js) (MIT)
3. [marked](https://github.com/markedjs/marked) (MIT, roadmap)
4. [highlight.js](https://github.com/highlightjs/highlight.js) (BSD, roadmap)
5. [CodeMirror](https://github.com/codemirror/dev) (MIT, roadmap: editor de arquivos)
6. [QuickJS-WASM](https://github.com/quickjs-ng/quickjs) (MIT, roadmap: sandbox JS mais duro)
7. [n8n](https://github.com/n8n-io/n8n) (fair-code, integração)
8. [Supabase JS](https://github.com/supabase/supabase-js) (Apache-2.0, integração)
9. [Firebase JS SDK](https://github.com/firebase/firebase-js-sdk) (Apache-2.0, integração)
10. [Acode](https://github.com/Acode-Foundation/Acode) (MIT): inspiração do modelo de plugins

## Segurança

- Chaves de API ficam **só** no `localStorage` do seu navegador.
- Código do agente roda em sandbox de página, sem acesso ao seu sistema.
- Integrações só enviam dados quando você configura e dispara.
- Nenhum dado é coletado por este projeto. Zero telemetria.

## Roadmap

- [ ] v1.1: editor de arquivos (CodeMirror), Vision Cam, Firebase Sync, modo agente (loop)
- [ ] v1.2: PWA instalável, plugins remotos via URL, importação/exportação de configuração
- [ ] v1.3: multi-agente (vários agentes conversando), gravação de sessão

## Licença

MIT © Nicolas Martins

Feito para o ecossistema [NEXUS](https://nm424294.hotmart.host/5-ias-nexus).

---

# Backend próprio (v1.5)

A plataforma agora tem backend real em `server/`, zero dependências externas (Node 18+).

## O que é real agora

| Módulo | Status | Detalhe |
|---|---|---|
| Gateway multimodelo | ✅ real | 14 provedores (OpenRouter, NVIDIA NIM, Gemini, Groq, Cerebras, MiniMax, DeepSeek, Mistral, Together, Fireworks, OpenAI, Anthropic, Hugging Face, Ollama local) + servidor OpenAI-compatível próprio |
| Streaming SSE | ✅ real | `POST /api/chat {stream:true}` token a token (OpenAI-compat e Gemini) |
| Fallback automático | ✅ real | provedor caiu, a requisição recai no próximo com chave |
| Cofre de chaves | ✅ real | AES-256-GCM em repouso; valores nunca saem da API (só os ids) |
| Terminal | ✅ real | `POST /api/terminal/exec` executa bash/node/npm/python/git de verdade, com timeout (1-60s), jail de workspace, bloqueio de padrões perigosos e limite de saída |
| VFS | ✅ real | listar/ler/escrever/deletar com jail de caminho (path traversal bloqueado) |
| Multiagente | ✅ real | 15 agentes especializados, seletor automático por tarefa, orquestrador com loop de ferramentas (exec, arquivos, webhook) de até 4 passos |
| GitHub | ✅ real | proxy autenticado para api.github.com (GET/POST/PATCH/PUT/DELETE) com token no cofre |
| Webhooks / n8n | ✅ real | disparo com proteção SSRF (bloqueia rede interna e http simples) |
| WhatsApp | ⚙️ bridge | envia ao bridge oficial que você configurar (WhatsApp Business Cloud API pelas regras da Meta) |
| Dashboard | ✅ real | `GET /api/status`: uptime, provedores configurados, workspace, últimos erros |
| Auditoria | ✅ real | `GET /api/audit`: log das últimas 100 operações |

## Rápido start

```bash
git clone https://github.com/nicorudorlk22-gif/nexus-super-agent
cd nexus-super-agent
node server/server.js          # http://localhost:3000
node --test server/test/       # 14 testes
```

No frontend (⚙️ → Backend próprio), aponte a URL do servidor e conecte: o terminal passa a executar comandos reais, o chat usa streaming dos seus provedores e `/agent <tarefa>` ativa o orquestrador multiagente.

API Keys via cofre (criptografadas):

```bash
curl -X PUT http://localhost:3000/api/keys \
  -H 'Content-Type: application/json' \
  -d '{"id":"key_openrouter","value":"sk-or-v1-..."}'
```

## Produção (isolamento forte)

O exec no servidor usa defesa em camadas (jail de cwd, timeout, bloqueios, saída limitada). Para isolamento de verdade use o container:

```bash
cp .env.example .env   # defina NEXUS_AUTH_TOKEN e NEXUS_MASTER_KEY
docker compose up -d
```

O `docker-compose.yml` roda sem privilégios, `read_only`, com limites de CPU/memória/processos e workspace em volume.

## Fases (plano do projeto)

- **FASE A-J**: estrutura, Model Hub, chat multimodelo, agentes, terminal, navegador, marketplace, integrações, voz, segurança ✅ base entregue nesta versão
- **Pendente honesto**: Docker por sessão com rede zerada (compose pronto, orquestração por contêiner dinâmico no roadmap), Playwright headless no navegador interno, RAG/pgvector, editor de arquivos com CodeMirror, MCP server, workers com filas (Redis), LSP/Tree-sitter

Nada é apresentado como funcionando sem estar funcionando. O que depende de credencial (provedores, GitHub, WhatsApp, n8n) responde com erro claro até você configurar.
