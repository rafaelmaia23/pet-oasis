#!/usr/bin/env sh
# Startup for the containerized app: apply migrations, seed, then run the server.
# migrate deploy (never migrate dev) + a bundled, idempotent seed make the
# environment come up from scratch on a clean database.
set -e

echo "Applying migrations..."
node_modules/.bin/prisma migrate deploy

echo "Seeding database..."
node dist/seed.js

echo "Starting server..."
exec node dist/server.js
