# syntax=docker/dockerfile:1

# A imagem base segue o `engines.node` do package.json: o pnpm recusa instalar
# quando o Node da máquina não casa com o range declarado, então máquina, CI e
# imagem correm a mesma major por construção, não por disciplina.
#
# O pnpm vem pelo corepack, que já está na imagem: `corepack enable` põe o shim
# no PATH e a primeira chamada a `pnpm` lê o campo `packageManager` do
# package.json, baixa exatamente aquela versão e confere o hash. Não há versão
# do pnpm escrita aqui — a fonte é uma, e é o package.json.

# ─── build ────────────────────────────────────────────────────────────────────
# Single `pnpm install` → generate Prisma client → bundle with tsup → prune to
# prod deps. One install (not two parallel ones) keeps peak memory low enough
# for small VPSes.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# OpenSSL antes do `pnpm install`: é no install que o @prisma/engines escolhe
# qual build do schema-engine baixar, detectando a versão do libssl. A
# bookworm-slim não traz nem o binário `openssl` nem o libssl (o Node linka o
# seu estaticamente), então a detecção falha e o Prisma cai no default
# silencioso `debian-openssl-1.1.x` — que hoje roda, mas é a engine errada
# escolhida por acidente, e o acidente muda de resultado em ARM64 ou num bump
# da imagem base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
# pnpm-workspace.yaml carrega o `allowBuilds` (bcrypt, prisma, esbuild…): sem
# ele o pnpm bloqueia os scripts de build e o bcrypt chega sem binário.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsup.config.ts prisma.config.ts ./
# prisma.config.ts resolves env("DATABASE_URL") at load time; `generate` does not
# connect, so a build-only placeholder is enough (never carried into runtime).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm run db:generate
RUN pnpm run build
# Drop dev dependencies in place → production-only node_modules for the runtime
# stage (reuses the install above; no second download/compile).
RUN pnpm prune --prod

# ─── runtime ──────────────────────────────────────────────────────────────────
# Slim, non-root image. The entrypoint applies migrations and seeds before start.
# No pnpm here: the entrypoint calls node_modules/.bin directly and the server
# is a plain `node dist/server.js`.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# O mesmo OpenSSL do estágio de build, pelo outro lado da mesma detecção: o
# entrypoint roda `prisma migrate deploy` a cada boot, e o CLI redetecta o
# libssl ali. Sem isto, a detecção falha de novo e o log de inicialização abre
# com dois blocos de warning; com isto, o que o boot detecta é o mesmo que o
# build baixou. Precisa vir antes do `USER node` (apt exige root).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Under pnpm, node_modules/ is a tree of relative symlinks into
# node_modules/.pnpm/; copying the directory whole keeps them valid.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# prisma migrate deploy needs the schema + migrations + config; the prisma CLI is
# a production dependency (already in node_modules).
COPY --from=build /app/prisma ./prisma
COPY package.json prisma.config.ts ./
COPY infra/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

# ─── dev ──────────────────────────────────────────────────────────────────────
# Full install (with devDeps), no bundle, no prune. Runs `tsx watch` against a
# bind-mounted src/. No `USER node` here: the container *starts* as root so the
# entrypoint can generate the Prisma client into the root-owned anonymous
# src/generated volume, then drops to the host's uid/gid (HOST_UID/HOST_GID,
# via `setpriv`) before anything writes to a bind mount — otherwise the files
# the seed leaves in ../uploads belong to root on the host (10.16). The Prisma
# client is generated at container start into that anon volume
# (see infra/docker-compose.dev.yml + infra/docker-entrypoint.dev.sh) — not baked here.
FROM node:24-bookworm-slim AS dev
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# O mesmo OpenSSL dos outros dois estágios, pelo mesmo motivo: o
# docker-entrypoint.dev.sh roda `prisma generate` e `migrate deploy`, então o
# `pnpm run dev` detecta o libssl igual ao boot de produção. Antes do
# `pnpm install`, que é onde o @prisma/engines escolhe qual schema-engine baixar.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsup.config.ts prisma.config.ts ./
COPY infra/docker-entrypoint.dev.sh ./
RUN chmod +x docker-entrypoint.dev.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.dev.sh"]
