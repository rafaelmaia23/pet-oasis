#!/usr/bin/env sh
# Startup for the containerized api: apply migrations, seed, then run the server.
# migrate deploy (never migrate dev) + a bundled, idempotent seed make the
# environment come up from scratch on a clean database.
#
# `set -e` still stops the boot when the seed exits non-zero, and that is on
# purpose: the seed only exits non-zero for **reference** data (features, roles,
# breeds, search lexemes), which is as much a prerequisite as the migration.
# Demonstration data is fail-open inside the seed itself (10.3, see
# src/lib/seed/optionalSeedStep.ts): it logs at error level and the seed carries
# on to here. A permission error writing a fake catalog image once put this
# container in a crash loop and the whole API behind a 502 — never again for
# that class of failure. Re-run by hand afterwards with
# `docker exec pet-oasis-api node dist/seed.js`.
set -e

echo "Applying migrations..."
node_modules/.bin/prisma migrate deploy

echo "Seeding database..."
node dist/seed.js

echo "Starting server..."
exec node dist/server.js
