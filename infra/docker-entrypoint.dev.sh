#!/usr/bin/env sh
# Dev startup: generate the Prisma client (into the anon-volume src/generated),
# apply migrations deterministically, seed reference data, then run the watcher.
# `exec` makes tsx PID 1 so it receives Compose's SIGTERM on stop/Ctrl+C.
set -e

echo "Generating Prisma client..."
node_modules/.bin/prisma generate

echo "Applying migrations..."
node_modules/.bin/prisma migrate deploy

echo "Seeding database..."
# Same split as production (10.3): reference data failing stops the boot here
# via `set -e`; demonstration data failing only logs, so `npm run dev` never
# dies over a fake catalog. The fence lives in src/lib/seed/optionalSeedStep.ts.
# Run the seed directly with the local tsx binary. `prisma db seed` would spawn
# `tsx` expecting it on PATH, which fails when prisma is invoked directly (not
# via an npm script that prepends node_modules/.bin).
node_modules/.bin/tsx prisma/seed.ts

echo "Starting dev server (tsx watch)..."
exec node_modules/.bin/tsx watch src/server.ts
