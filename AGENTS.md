# NEXUS AI — Guia de desenvolvimento (Base44)

## O que é
App single-file: `index.html` (frontend) + `server/` (backend Node, zero dependências, Node 18+).
O backend serve a API REST/SSE em `/api/*` **e** o `index.html` em `/`.

## Rodar (dev)
```bash
docker compose -f docker-compose.base44.yml up -d   # porta 3000
```
- Backend: `node --watch server/server.js` (live reload do backend).
- Frontend: `index.html` é estático — após editar, chame `reload_preview` (sem hot reload).
- JS split em `js/app.js` (core) e `js/backend.js` (modo backend + admin). Carregados em ordem via `<script>`.

## Estrutura
- `index.html` — HTML + CSS (layout 3 colunas, tema dark roxo/azul/verde).
- `js/app.js` — estado, boot, navegação, chat, terminal, browser, plugins, agentes, modelos, voz, visual.
- `js/backend.js` — overrides p/ backend conectado (streaming SSE, terminal real, /agent, admin, cofre, auditoria).
- `server/server.js` — API: status, models, chat (SSE), agents, terminal/exec, files (VFS), keys (cofre AES), github, webhook, audit.
- `server/lib/` — providers (catálogo 14 provedores), core (vault/VFS/exec), ai (roteador+fallback+stream), agents (orquestrador 15 agentes).

## Segredos
- `NEXUS_MASTER_KEY` — chave do cofre AES-256-GCM (gerada p/ dev; defina valor real em produção).
- `NEXUS_AUTH_TOKEN` — opcional; sem ele o backend aceita qualquer origem (modo dev).

## Verificar
- `curl http://localhost:3000/api/status` → JSON do backend.
- `curl http://localhost:3000/` → `index.html`.
- Preview: header NEXUS AI, 3 colunas (nav esquerda, chat centro, painel direito), bottom bar.

## Notas
- Sem backend conectado: modo local (demo, Pyodide, VFS em memória).
- Com backend (⚙️ → Backend): streaming SSE, terminal real com jail, /agent orquestrador, VFS persistente, GitHub proxy.
- Bibliotecas CDN: xterm.js (terminal), marked (markdown no chat), highlight.js (syntax), Pyodide (Python, lazy).
