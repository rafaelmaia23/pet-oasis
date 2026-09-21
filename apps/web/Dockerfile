# syntax=docker/dockerfile:1

# O contexto de build é a RAIZ DO MONOREPO, não este diretório: o lockfile e o
# pnpm-workspace.yaml vivem lá, e o pnpm só instala um projeto de dentro do
# workspace dele. Todo COPY abaixo é relativo à raiz (apps/web/...), e o
# .dockerignore que vale é o `Dockerfile.dockerignore` ao lado deste arquivo —
# é ele que deixa a API fora do contexto (por Dockerfile, e não na raiz: cada
# app exclui o que não é seu). Mesmo desenho do Dockerfile da API.
#
# Imagem base, corepack e a versão do pnpm: idem à API — `node:24` segue o
# `engines.node` da raiz, e o pnpm vem do campo `packageManager`, sem versão
# escrita aqui.

# ─── build ────────────────────────────────────────────────────────────────────
# Install filtrado do workspace (só o web e os pacotes internos que ele usa) →
# `pnpm deploy` do web para /deploy → `next build` LÁ DENTRO. A ordem importa:
# o deploy materializa o web como projeto autocontido, fora do workspace, então
# o `next build` não enxerga a API nem o lockfile da raiz — o standalone que
# ele emite (`.next/standalone`) é raso (server.js na raiz) e só alcança o que o
# web importa. Buildar dentro do workspace também funciona (o Next detecta a
# raiz e emite `standalone/apps/web/...`), mas aí "a imagem não contém a API" é
# garantido pelo tracing do Next, não por construção.
#
# O deploy leva devDependencies (sem `--prod`) porque é o build que roda nele:
# Tailwind, TypeScript e o resto. Não há `prune` depois — o próprio standalone
# já é o recorte de produção, e é só ele que o runtime copia.
FROM node:24-bookworm-slim AS build
WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# Os manifestos do workspace primeiro, para a camada do install só invalidar
# quando uma dependência muda. O da API também entra: o lockfile o lista como
# importer, e um install que só funciona por tolerância a manifesto ausente é
# acidente esperando bump (o mesmo motivo do `--parents packages/*` na API).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY --parents packages/*/package.json ./
# `--filter web...`: o web e o que ele depende no workspace. A API fica de fora
# do install — Prisma, bcrypt e sharp não têm o que fazer nesta imagem.
RUN pnpm install --frozen-lockfile --filter web...
# Os pacotes internos inteiros: o tsconfig do web estende o preset de
# `packages/tsconfig`, e o `pnpm deploy` copia cada dependência de workspace
# para dentro de /deploy.
COPY packages packages
COPY apps/web/src apps/web/src
COPY apps/web/public apps/web/public
# next-env.d.ts fica de fora de propósito: é gerado (e ignorado pelo Git), então
# num clone limpo ele não existe. O `next build` abaixo o regenera.
COPY apps/web/next.config.ts apps/web/tsconfig.json apps/web/postcss.config.mjs apps/web/
RUN pnpm --filter web deploy /deploy
WORKDIR /deploy
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ─── runtime ──────────────────────────────────────────────────────────────────
# Imagem slim, non-root, rasa em /app: só o standalone e os estáticos.
# `server.js` traz o próprio servidor Node, então não há `next start`, CLI do
# Next, pnpm nem workspace aqui.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Mesma porta do desenvolvimento (a API ocupa a 3000).
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /deploy/public ./public
COPY --from=build --chown=node:node /deploy/.next/standalone ./
# O standalone não inclui os estáticos: eles ficam fora do grafo de módulos e
# precisam ser copiados à parte, no mesmo caminho relativo.
COPY --from=build --chown=node:node /deploy/.next/static ./.next/static
USER node
EXPOSE 3001
# Sem curl nem wget na imagem slim — o healthcheck usa o fetch global do próprio
# Node. É o que faz `--wait` no `prod:up` esperar a página, e não só o processo.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
