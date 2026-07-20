# syntax=docker/dockerfile:1

# ─── build ────────────────────────────────────────────────────────────────────
# Single `npm ci` → generate Prisma client → bundle with tsup → prune to prod deps.
# One install (not two parallel ones) keeps peak memory low enough for small VPSes.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsup.config.ts prisma.config.ts ./
# prisma.config.ts resolves env("DATABASE_URL") at load time; `generate` does not
# connect, so a build-only placeholder is enough (never carried into runtime).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run db:generate
RUN npm run build
# Drop dev dependencies in place → production-only node_modules for the runtime
# stage (reuses the install above; no second download/compile).
RUN npm prune --omit=dev

# ─── runtime ──────────────────────────────────────────────────────────────────
# Slim, non-root image. The entrypoint applies migrations and seeds before start.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
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
# bind-mounted src/. Stays root (no `USER node`) so writes to the bind-mount and
# to the anonymous src/generated volume don't hit host-uid mismatches. The
# Prisma client is generated at container start into that anon volume
# (see infra/docker-compose.dev.yml + infra/docker-entrypoint.dev.sh) — not baked here.
FROM node:22-bookworm-slim AS dev
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsup.config.ts prisma.config.ts ./
COPY infra/docker-entrypoint.dev.sh ./
RUN chmod +x docker-entrypoint.dev.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.dev.sh"]
