FROM node:20-alpine

# Usuário sem privilégios: execução de comandos do terminal não roda como root
RUN addgroup -S nexus && adduser -S nexus -G nexus
WORKDIR /app

COPY server/ ./server/
RUN mkdir -p /app/server/data && chown -R nexus:nexus /app
ENV NODE_ENV=production NEXUS_WORKSPACE=/workspace
RUN mkdir -p /workspace && chown -R nexus:nexus /workspace

USER nexus
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/status || exit 1
CMD ["node", "server/server.js"]
