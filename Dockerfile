# syntax=docker/dockerfile:1

# ─── deps ─────────────────────────────────────────────────────────────────────
# Production-only node_modules for the runtime stage.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── build ────────────────────────────────────────────────────────────────────
# Full deps → generate Prisma client → bundle the app with tsup.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsup.config.ts prisma.config.ts ./
# prisma.config.ts resolves env("DATABASE_URL") at load time; `generate` does not
# connect, so a build-only placeholder is enough (never carried into runtime).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run db:generate
RUN npm run build

# ─── runtime ──────────────────────────────────────────────────────────────────
# Slim, non-root image. The entrypoint applies migrations and seeds before start.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# prisma migrate deploy needs the schema + migrations + config; the prisma CLI is
# a production dependency (already in node_modules).
COPY --from=build /app/prisma ./prisma
COPY package.json prisma.config.ts ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
