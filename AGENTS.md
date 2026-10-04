# AGENTS.md — NEXUS Super Agent (Base44 dev setup)

## O que é o projeto
App de IA "NEXUS Super Agent": frontend single-file (`index.html`, ~900 linhas, sem build) + backend Node zero-dependência em `server/` (Node 18+). O frontend roda em "modo local" sem backend; conectar o backend (⚙️ → Backend próprio) ativa terminal real, streaming SSE e orquestrador multiagente.

## Como roda aqui (docker-compose.base44.yml)
- Um único serviço `nexus` (imagem `node:20-alpine`) bind-mounta o repo em `/app` e roda `node --watch server/server.js` → live reload do backend ao editar `server/`.
- Porta 3000 serve **frontend + API** na mesma origem. O `index.html` é estático; edite e recarregue o preview (sem hot reload de frontend).
- `NEXUS_MASTER_KEY` (cofre AES-256-GCM) vem de `/run/base44/app.env` como placeholder de dev. Sem ela o server usa chave derivada do hostname (instável entre containers).
- `NEXUS_AUTH_TOKEN` fica indefinido em dev → modo `dev-local` (sem auth). Defina via secrets para produção.
- Healthcheck: `GET /api/status`.

## Mudança de código para rodar aqui
`server/server.js` originalmente era API-only (servia só `/api/*` e 404 no resto). Adicionado bloco "FRONTEND ESTÁTICO" que serve `index.html` e arquivos estáticos do repo root para rotas GET não-API, para o preview mostrar o app na porta 3000. Não altera nenhuma rota de API.

## Verificar
- `curl -s http://localhost:3000/api/status` → JSON com `authMode: "dev-local"`.
- `curl -s http://localhost:3000/` → `<html>...NEXUS Super Agent...`.
- `docker compose -f docker-compose.base44.yml logs --tail 20 nexus`.

## Credenciais externas (opcionais)
Nenhuma é obrigatória para boot. Para funcionalidades reais: chaves de provedores de IA (OpenRouter, Gemini, etc.), `key_github`, `key_whatsapp_bridge` — todas adicionadas em runtime pelo cofre (`PUT /api/keys`) ou via ⚙️ no frontend, não por env. O app funciona em modo demo sem nenhuma delas.
