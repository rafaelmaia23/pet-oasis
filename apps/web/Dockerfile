# syntax=docker/dockerfile:1

# ─── build ────────────────────────────────────────────────────────────────────
# Um único `npm ci` → `next build`. O build emite .next/standalone: um bundle
# autocontido com só as dependências que o servidor realmente alcança, então não
# há `npm prune` aqui — o próprio Next já fez o recorte.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY next.config.ts tsconfig.json next-env.d.ts postcss.config.mjs ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── runtime ──────────────────────────────────────────────────────────────────
# Imagem slim, non-root. Só o standalone e os estáticos: `server.js` traz o
# próprio servidor Node, então não há `next start` nem CLI do Next aqui.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Mesma porta do desenvolvimento (a API ocupa a 3000).
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
# O standalone não inclui os estáticos: eles ficam fora do grafo de módulos e
# precisam ser copiados à parte, no mesmo caminho relativo.
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
# Sem curl nem wget na imagem slim — o healthcheck usa o fetch global do próprio
# Node. É o que faz `--wait` no `prod:up` esperar a página, e não só o processo.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
